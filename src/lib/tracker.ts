import "server-only";
import { and, asc, desc, eq, isNull, isNotNull, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import { trackerItems, trackerItemChanges, users, type FieldDefinition } from "@/db/schema";
import { normalizeValue, isEqualValue, hasOptions } from "./fields";
import { listFields } from "./queries";
import { touchProject } from "./project-service";
import { applyFormulas, applyStoredFormulas, FORMULAS } from "./formulas";
import { sortByCode } from "./code-sort";
import { checkHierarchy, getLevelParents } from "./hierarchy";
import { projects } from "@/db/schema";
import { todayISO } from "./format";

export async function formulaCtx(projectId: string) {
  const [p] = await db.select({ settings: projects.settings }).from(projects).where(eq(projects.id, projectId));
  return { startDate: p?.settings?.faStartDate ?? null, today: todayISO() };
}

/** 读取时补齐计算字段（计划日期、延迟天数、前缀编码等） */
export async function listItemsDerived(projectId: string, moduleKey: string, fields: FieldDefinition[]) {
  const [items, ctx] = await Promise.all([listItems(projectId, moduleKey), formulaCtx(projectId)]);
  // 以任务编号为主索引，按字母从小到大排列（导出的 Excel / PDF 同序）
  const codeKey = fields.find((f) => f.role === "code")?.key;
  return { ctx, items: sortByCode(items.map((i) => ({ ...i, data: applyFormulas(fields, i.data, ctx) })), codeKey) };
}

export async function listItems(projectId: string, moduleKey: string, deleted = false) {
  return db
    .select()
    .from(trackerItems)
    .where(
      and(
        eq(trackerItems.projectId, projectId),
        eq(trackerItems.moduleKey, moduleKey),
        deleted ? isNotNull(trackerItems.deletedAt) : isNull(trackerItems.deletedAt),
      ),
    )
    .orderBy(asc(trackerItems.seq));
}

/** 按字段定义清洗一条记录的数据；strict=true 时下拉值必须在选项内 */
export function sanitize(fields: FieldDefinition[], raw: Record<string, unknown>, opts: { strict: boolean; partial: boolean }) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.formula) continue; // 计算字段只读，不接受写入
    if (!(f.key in raw)) {
      if (!opts.partial && f.required) throw new Error(`「${f.label}」为必填项`);
      continue;
    }
    const v = normalizeValue(f.type, raw[f.key]);
    if (f.required && (v === null || (Array.isArray(v) && v.length === 0))) throw new Error(`「${f.label}」为必填项`);
    if (opts.strict && v !== null && hasOptions(f.type) && f.options.length) {
      const vs = Array.isArray(v) ? v : [v];
      const bad = vs.find((x) => !f.options.includes(String(x)));
      if (bad) throw new Error(`「${f.label}」的值「${bad}」不在下拉选项中`);
    }
    out[f.key] = v;
  }
  return out;
}

/**
 * 写入前补齐：DD 顺序码留空时取同组（分类编码+大类+中类）下一个号；分类名称按分类编码自动带出；再计算存库型公式
 */
export async function fillStored(projectId: string, moduleKey: string, fields: FieldDefinition[], data: Record<string, unknown>, selfId?: string) {
  const out = { ...data };
  if (moduleKey === "dd" && fields.some((f) => f.formula === "dd_code")) {
    if ((out.seq === null || out.seq === undefined || out.seq === "") && out.cat_code && out.major_code && out.minor_code) {
      const rows = await db
        .select({ id: trackerItems.id, data: trackerItems.data })
        .from(trackerItems)
        .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, moduleKey), isNull(trackerItems.deletedAt)));
      const same = rows.filter((r) => r.id !== selfId && r.data.cat_code === out.cat_code && r.data.major_code === out.major_code && r.data.minor_code === out.minor_code);
      out.seq = Math.max(0, ...same.map((r) => Number(r.data.seq) || 0)) + 1;
    }
    const catF = fields.find((f) => f.key === "category");
    const m = String(out.cat_code ?? "").match(/^S(\d+)$/i);
    if (catF && !out.category && m) out.category = catF.options.find((o) => o.startsWith(`${m[1]}.`)) ?? null;
  }
  // Q&A：编号留空时取当前最大编号 + 1
  if (moduleKey === "qa") {
    const codeF = fields.find((f) => f.role === "code");
    if (codeF && (out[codeF.key] === null || out[codeF.key] === undefined || String(out[codeF.key]).trim() === "")) {
      const rows = await db
        .select({ k: trackerItems.externalKey })
        .from(trackerItems)
        .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, moduleKey)));
      out[codeF.key] = String(Math.max(0, ...rows.map((r) => Number(r.k) || 0)) + 1);
    }
  }
  return applyStoredFormulas(fields, out);
}

/** 手工新增/修改：编号（匹配键）必须存在且唯一 */
export async function assertUniqueCode(projectId: string, moduleKey: string, fields: FieldDefinition[], data: Record<string, unknown>, selfId?: string) {
  const codeF = fields.find((f) => f.role === "code");
  if (!codeF) return;
  const code = String(data[codeF.key] ?? "").trim();
  if (!code) {
    if (codeF.formula) throw new Error(`「${codeF.label}」无法生成：${FORMULAS[codeF.formula]?.desc ?? "请补全组成字段"}`);
    return;
  }
  const rows = await db
    .select({ id: trackerItems.id, data: trackerItems.data })
    .from(trackerItems)
    .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, moduleKey), isNull(trackerItems.deletedAt)));
  if (rows.some((r) => r.id !== selfId && String(r.data[codeF.key] ?? "").trim() === code)) throw new Error(`${codeF.label} ${code} 已存在`);
}

/** FA：手工新增/修改时校验任务从属关系（上级任务必须存在且等级匹配） */
export async function assertHierarchy(projectId: string, moduleKey: string, fields: FieldDefinition[], data: Record<string, unknown>, selfId?: string) {
  if (moduleKey !== "fa") return;
  const codeF = fields.find((f) => f.role === "code");
  const levelF = fields.find((f) => f.role === "priority");
  if (!codeF || !levelF || !levelF.config?.levelParents) return;
  const rows = await db
    .select({ id: trackerItems.id, data: trackerItems.data })
    .from(trackerItems)
    .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, moduleKey), isNull(trackerItems.deletedAt)));
  const code = String(data[codeF.key] ?? "").trim();
  const dup = rows.find((r) => r.id !== selfId && String(r.data[codeF.key] ?? "").trim() === code);
  if (code && dup) throw new Error(`任务编号 ${code} 已存在`);
  const map = new Map(rows.filter((r) => r.id !== selfId).map((r) => [String(r.data[codeF.key] ?? "").trim(), { level: r.data[levelF.key] }]));
  const issue = checkHierarchy(data[codeF.key], data[levelF.key], getLevelParents(levelF.config, levelF.options), (c) => map.get(c));
  if (issue) throw new Error(issue);
}

export async function nextSeq(projectId: string, moduleKey: string) {
  const [r] = await db
    .select({ m: sql<number>`coalesce(max(${trackerItems.seq}), 0)::int` })
    .from(trackerItems)
    .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, moduleKey)));
  return (r?.m ?? 0) + 1;
}

export async function createItem(
  projectId: string, moduleKey: string, raw: Record<string, unknown>, actorId: string, source: "manual" | "import" = "manual", importBatchId?: string,
  pre?: { fields: FieldDefinition[]; seq: number },
) {
  const fields = pre?.fields ?? (await listFields(projectId, moduleKey));
  if (moduleKey === "qa" && source === "manual") {
    // Q&A 手工新增：更新日期取当天；权限组默认 ADM（最严格）；回复状态默认「未答复」
    const has = (k: string) => fields.some((f) => f.key === k);
    raw = { ...raw };
    if (!raw.update_date && has("update_date")) raw.update_date = todayISO();
    if (!raw.access_group && has("access_group")) raw.access_group = "ADM";
    if (!raw.status && has("status")) raw.status = fields.find((f) => f.key === "status")?.options[0] ?? null;
  }
  const data = await fillStored(projectId, moduleKey, fields, sanitize(fields, raw, { strict: source === "manual", partial: false }));
  if (source === "manual") {
    await assertUniqueCode(projectId, moduleKey, fields, data);
    await assertHierarchy(projectId, moduleKey, fields, data);
  }
  const now = new Date();
  const codeField = fields.find((f) => f.role === "code");
  const fieldUpdatedAt = Object.fromEntries(Object.keys(data).filter((k) => data[k] !== null).map((k) => [k, now.toISOString()]));
  const [item] = await db
    .insert(trackerItems)
    .values({
      projectId, moduleKey, seq: pre?.seq ?? (await nextSeq(projectId, moduleKey)), data, fieldUpdatedAt,
      externalKey: codeField && data[codeField.key] ? String(data[codeField.key]) : null,
      createdBy: actorId, updatedBy: actorId, createdAt: now, updatedAt: now, importBatchId,
    })
    .returning();
  await db.insert(trackerItemChanges).values({
    itemId: item.id, projectId, moduleKey, action: "create", source, actorId, importBatchId,
    changes: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null).map(([k, v]) => [k, { from: null, to: v }])),
    snapshot: data, createdAt: now,
  });
  if (!pre) await touchProject(projectId);
  return item;
}

export async function getItem(itemId: string) {
  const [it] = await db.select().from(trackerItems).where(eq(trackerItems.id, itemId)).limit(1);
  return it ?? null;
}

export async function updateItem(
  itemId: string, raw: Record<string, unknown>, actorId: string, source: "manual" | "import" = "manual", importBatchId?: string,
  preFields?: FieldDefinition[],
) {
  const item = await getItem(itemId);
  if (!item || item.deletedAt) throw new Error("记录不存在或已被删除");
  const fields = preFields ?? (await listFields(item.projectId, item.moduleKey));
  const patch = sanitize(fields, raw, { strict: source === "manual", partial: true });
  // Q&A：手工修改时自动刷新「更新日期」（导入时以文件为准）
  const qaTouch = item.moduleKey === "qa" && source === "manual" && fields.some((f) => f.key === "update_date") && (!("update_date" in raw) || isEqualValue(normalizeValue("date", raw.update_date), item.data.update_date ?? null));
  // 存库型公式（如 DD 材料前缀编码）随组成字段变化而重算
  const merged = await fillStored(item.projectId, item.moduleKey, fields, { ...item.data, ...patch }, item.id);
  for (const f of fields) if (f.formula && !isEqualValue(merged[f.key], item.data[f.key]) && FORMULAS[f.formula]?.stored) patch[f.key] = merged[f.key];
  for (const k of Object.keys(merged)) if (!(k in patch) && !isEqualValue(merged[k], item.data[k]) && !fields.find((f) => f.key === k)?.formula) patch[k] = merged[k];
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!isEqualValue(item.data[k], v)) changes[k] = { from: item.data[k] ?? null, to: v };
  }
  if (!Object.keys(changes).length) return { item, changed: false };
  if (qaTouch && !isEqualValue(item.data.update_date, todayISO())) {
    patch.update_date = todayISO();
    changes.update_date = { from: item.data.update_date ?? null, to: patch.update_date };
  }
  const now = new Date();
  const data = { ...item.data, ...patch };
  if (source === "manual") {
    await assertUniqueCode(item.projectId, item.moduleKey, fields, data, item.id);
    await assertHierarchy(item.projectId, item.moduleKey, fields, data, item.id);
  }
  const fieldUpdatedAt = { ...item.fieldUpdatedAt };
  for (const k of Object.keys(changes)) fieldUpdatedAt[k] = now.toISOString();
  const codeField = fields.find((f) => f.role === "code");
  const [updated] = await db
    .update(trackerItems)
    .set({
      data, fieldUpdatedAt, updatedAt: now, updatedBy: actorId,
      externalKey: codeField ? (data[codeField.key] ? String(data[codeField.key]) : null) : item.externalKey,
    })
    .where(eq(trackerItems.id, itemId))
    .returning();
  await db.insert(trackerItemChanges).values({
    itemId, projectId: item.projectId, moduleKey: item.moduleKey, action: "update", source, actorId, importBatchId, changes, snapshot: data, createdAt: now,
  });
  if (!preFields) await touchProject(item.projectId);
  return { item: updated, changed: true };
}

export async function softDeleteItems(ids: string[], actorId: string, source: "manual" | "import" = "manual", importBatchId?: string) {
  if (!ids.length) return 0;
  const rows = await db.select().from(trackerItems).where(and(inArray(trackerItems.id, ids), isNull(trackerItems.deletedAt)));
  const now = new Date();
  for (const it of rows) {
    await db.update(trackerItems).set({ deletedAt: now, deletedBy: actorId, updatedAt: now }).where(eq(trackerItems.id, it.id));
    await db.insert(trackerItemChanges).values({
      itemId: it.id, projectId: it.projectId, moduleKey: it.moduleKey, action: "delete", source, actorId, importBatchId, snapshot: it.data, createdAt: now,
    });
  }
  if (rows[0]) await touchProject(rows[0].projectId);
  return rows.length;
}

export async function restoreItem(itemId: string, actorId: string) {
  const it = await getItem(itemId);
  if (!it || !it.deletedAt) throw new Error("该记录未被删除");
  const now = new Date();
  await db.update(trackerItems).set({ deletedAt: null, deletedBy: null, updatedAt: now, updatedBy: actorId }).where(eq(trackerItems.id, itemId));
  await db.insert(trackerItemChanges).values({
    itemId, projectId: it.projectId, moduleKey: it.moduleKey, action: "restore", source: "manual", actorId, snapshot: it.data, createdAt: now,
  });
  return it;
}

export async function itemHistory(itemId: string) {
  return db
    .select({ c: trackerItemChanges, actor: users.name })
    .from(trackerItemChanges)
    .leftJoin(users, eq(users.id, trackerItemChanges.actorId))
    .where(eq(trackerItemChanges.itemId, itemId))
    .orderBy(desc(trackerItemChanges.createdAt));
}

export async function moduleHistory(projectId: string, moduleKey: string, limit = 500) {
  return db
    .select({ c: trackerItemChanges, actor: users.name, seq: trackerItems.seq, deletedAt: trackerItems.deletedAt })
    .from(trackerItemChanges)
    .leftJoin(users, eq(users.id, trackerItemChanges.actorId))
    .leftJoin(trackerItems, eq(trackerItems.id, trackerItemChanges.itemId))
    .where(and(eq(trackerItemChanges.projectId, projectId), eq(trackerItemChanges.moduleKey, moduleKey)))
    .orderBy(desc(trackerItemChanges.createdAt))
    .limit(limit);
}
