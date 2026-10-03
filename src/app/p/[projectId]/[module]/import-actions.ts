"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { importBatches, trackerItems, fieldDefinitions, projects } from "@/db/schema";
import { assertProject, audit } from "@/lib/auth";
import { run } from "@/lib/action";
import { isTrackerModule } from "@/lib/modules";
import { listFields } from "@/lib/queries";
import { createItem, updateItem, softDeleteItems, nextSeq } from "@/lib/tracker";
import { touchProject } from "@/lib/project-service";
import { slugKey } from "@/lib/fields";
import { checkHierarchy, getLevelParents } from "@/lib/hierarchy";
import { IMPORT_SKILLS } from "@/skills";
import { loadWorkbook } from "@/lib/import/excel";
import { pickSheet, findHeaderRow, mapColumns, claudeMapColumns, readMeta, readRows, diffRows } from "@/lib/import/engine";
import type { BatchPayload, ImportPreview } from "@/lib/import/types";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel 函数请求体上限约 4.5MB

export async function previewImport(projectId: string, moduleKey: string, fd: FormData) {
  return run<ImportPreview>(async () => {
    if (!isTrackerModule(moduleKey)) throw new Error("该模块不支持导入");
    const a = await assertProject(projectId, true);
    const file = fd.get("file");
    if (!(file instanceof File)) throw new Error("请选择 Excel 文件");
    if (!/\.xlsx$/i.test(file.name)) throw new Error("仅支持 .xlsx 格式（如为 .xls 请先另存为 .xlsx）");
    if (file.size > MAX_BYTES) throw new Error("文件超过 4MB");
    const mode = fd.get("mode") === "sync" ? "sync" : "merge";
    const keepExistingOnEmpty = fd.get("keepEmpty") !== "0";
    const useClaude = fd.get("useClaude") !== "0";
    const createFields = fd.get("createFields") === "1";

    const skill = IMPORT_SKILLS[moduleKey];
    const fields = await listFields(projectId, moduleKey);
    const wb = await loadWorkbook(await file.arrayBuffer());
    const ws = pickSheet(wb, skill);
    const headerRow = findHeaderRow(ws, skill);
    const columns = mapColumns(ws, headerRow, fields);
    const warnings: string[] = [];
    let usedClaude = false;
    if (useClaude && columns.some((c) => !c.fieldKey)) {
      try {
        usedClaude = await claudeMapColumns(skill, columns, fields);
      } catch (e) {
        warnings.push(`Claude 字段识别未成功（${e instanceof Error ? e.message.slice(0, 80) : "未知错误"}），未匹配列将被忽略`);
      }
    }
    const codeFld = fields.find((f) => f.role === "code");
    if (!codeFld) {
      throw new Error("本模块没有设置「编号」角色的字段（数据库结构可能尚未升级）。请确认 Vercel 最新部署的构建日志中出现「数据库迁移完成」，或在项目管理的字段配置中为匹配键字段设置「编号」角色");
    }
    if (!codeFld.formula && !columns.some((c) => c.fieldKey === codeFld.key)) {
      throw new Error(`文件中没有找到匹配键列「${codeFld.label}」，无法与已有记录比对。请确认上传的是${skill.title}，且表头包含「${codeFld.label}」`);
    }
    const meta = readMeta(ws, headerRow, skill);
    const parsed = readRows(ws, headerRow, columns, fields, skill, { startDate: meta.startDate ?? a.project.settings?.faStartDate ?? null });
    warnings.push(...parsed.warnings);

    const existing = await db
      .select({ id: trackerItems.id, externalKey: trackerItems.externalKey, data: trackerItems.data })
      .from(trackerItems)
      .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, moduleKey), isNull(trackerItems.deletedAt)));
    // FA：检查任务从属关系（以文件 + 网站现有记录为准，仅提示不阻止）
    if (moduleKey === "fa") {
      const codeF = fields.find((f) => f.role === "code");
      const levelF = fields.find((f) => f.role === "priority");
      if (codeF && levelF) {
        const parents = getLevelParents(levelF.config, levelF.options);
        const all = new Map<string, { level: unknown }>();
        for (const e of existing) if (e.externalKey) all.set(e.externalKey, { level: e.data[levelF.key] });
        for (const r of parsed.rows) all.set(r.code, { level: r.data[levelF.key] ?? all.get(r.code)?.level });
        for (const r of parsed.rows) {
          const issue = checkHierarchy(r.code, all.get(r.code)?.level, parents, (c) => all.get(c));
          if (issue) warnings.push(`第 ${r.rowNo} 行：${issue}`);
        }
      }
    }
    const mappedKeys = new Set(columns.map((c) => c.fieldKey).filter(Boolean) as string[]);
    const diff = diffRows(fields, parsed.rows, existing, { mode, keepExistingOnEmpty, mappedKeys });

    const newFields = createFields ? columns.filter((c) => !c.fieldKey).map((c) => ({ label: c.header, col: c.col })) : [];
    const payload: BatchPayload = {
      creates: diff.creates,
      updates: diff.updates.map(({ itemId, code, patch }) => ({ itemId, code, patch })),
      deletes: diff.deletes.map(({ itemId, code }) => ({ itemId, code })),
      newOptions: diff.newOptions,
      newFields,
      newFieldValues: createFields ? parsed.extra : {},
      meta,
    };
    const [batch] = await db
      .insert(importBatches)
      .values({
        projectId, moduleKey, fileName: file.name, mode, status: "preview", createdBy: a.user.id, payload,
        stats: { rows: parsed.rows.length, create: diff.creates.length, update: diff.updates.length, delete: diff.deletes.length, unchanged: diff.unchanged },
      })
      .returning();

    const titleF = fields.find((f) => f.role === "title");
    const title = (d: Record<string, unknown>) => String((titleF && d[titleF.key]) || "").split("\n")[0];
    const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
    const preview: ImportPreview = {
      batchId: batch.id,
      fileName: file.name,
      sheetName: ws.name,
      headerRow,
      columns,
      meta,
      currentStartDate: a.project.settings?.faStartDate ?? null,
      counts: { rows: parsed.rows.length, create: diff.creates.length, update: diff.updates.length, unchanged: diff.unchanged, delete: diff.deletes.length, warnings: warnings.length },
      creates: diff.creates.map((c) => ({ code: c.code, title: title(c.data) })),
      updates: diff.updates.map((u) => ({ code: u.code, title: title(parsed.rows.find((r) => r.code === u.code)?.data ?? {}), changes: u.changes })),
      deletes: diff.deletes.map((d) => ({ code: d.code, title: d.title.split("\n")[0] })),
      warnings,
      newOptions: Object.entries(diff.newOptions).map(([k, v]) => ({ field: labelOf(k), values: v })),
      newFields: newFields.map((f) => f.label),
      usedClaude,
    };
    return preview;
  });
}

export async function applyImport(projectId: string, moduleKey: string, batchId: string, opts: { addOptions: boolean; applyStartDate: boolean }) {
  return run(async () => {
    if (!isTrackerModule(moduleKey)) throw new Error("该模块不支持导入");
    const a = await assertProject(projectId, true);
    const [b] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!b || b.projectId !== projectId || b.moduleKey !== moduleKey) throw new Error("导入批次不存在");
    if (b.status !== "preview") throw new Error("该批次已处理，请重新上传");
    const p = b.payload as BatchPayload;

    // 1) 字段：补充下拉选项、按需新增字段
    const fields = await listFields(projectId, moduleKey);
    if (opts.addOptions) {
      for (const [key, vals] of Object.entries(p.newOptions)) {
        const f = fields.find((x) => x.key === key);
        if (f) await db.update(fieldDefinitions).set({ options: [...f.options, ...vals.filter((v) => !f.options.includes(v))], updatedAt: new Date() }).where(eq(fieldDefinitions.id, f.id));
      }
    }
    const labelToKey: Record<string, string> = {};
    if (p.newFields.length) {
      let order = Math.max(0, ...fields.map((f) => f.sortOrder));
      const keys = fields.map((f) => f.key);
      for (const nf of p.newFields) {
        const key = slugKey(/[a-z0-9]/i.test(nf.label) ? nf.label : `col_${nf.col}`, keys);
        keys.push(key);
        order += 10;
        await db.insert(fieldDefinitions).values({ projectId, moduleKey, key, label: nf.label.slice(0, 40), type: "text", sortOrder: order, aliases: [nf.label] });
        labelToKey[nf.label] = key;
      }
    }
    const withExtra = (code: string, data: Record<string, unknown>) => {
      const ex = p.newFieldValues[code];
      if (!ex) return data;
      const out = { ...data };
      for (const [label, v] of Object.entries(ex)) if (labelToKey[label]) out[labelToKey[label]] = v;
      return out;
    };

    // 2) 记录：新增 / 更新 / 删除（均写入变更日志，source = import）
    const fresh = await listFields(projectId, moduleKey);
    let seq = await nextSeq(projectId, moduleKey);
    let c = 0, u = 0;
    // 按文件中的顺序写入，保持与 Excel 一致的行序
    for (const x of p.creates) {
      await createItem(projectId, moduleKey, withExtra(x.code, x.data), a.user.id, "import", batchId, { fields: fresh, seq: seq++ });
      c++;
    }
    for (const x of p.updates) {
      const r = await updateItem(x.itemId, withExtra(x.code, x.patch), a.user.id, "import", batchId, fresh).catch(() => null);
      if (r?.changed) u++;
    }
    await touchProject(projectId);
    const d = await softDeleteItems(p.deletes.map((x) => x.itemId), a.user.id, "import", batchId);

    // 3) 项目开始日
    if (opts.applyStartDate && p.meta.startDate && moduleKey === "fa") {
      await db.update(projects).set({ settings: { ...a.project.settings, faStartDate: p.meta.startDate }, updatedAt: new Date() }).where(eq(projects.id, projectId));
    }
    await db.update(importBatches).set({ status: "applied", appliedAt: new Date(), stats: { ...b.stats, applied_create: c, applied_update: u, applied_delete: d } }).where(eq(importBatches.id, batchId));
    await audit(a.user.id, "import.apply", { moduleKey, file: b.fileName, create: c, update: u, delete: d }, projectId);
    revalidatePath(`/p/${projectId}`, "layout");
    return { create: c, update: u, delete: d };
  }, "导入完成");
}
