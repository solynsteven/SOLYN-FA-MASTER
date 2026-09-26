import "server-only";
import { and, asc, desc, eq, isNull, isNotNull, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import { trackerItems, trackerItemChanges, users, type FieldDefinition } from "@/db/schema";
import { normalizeValue, isEqualValue, hasOptions } from "./fields";
import { listFields } from "./queries";
import { touchProject } from "./project-service";
import { applyFormulas } from "./formulas";
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
  return { ctx, items: items.map((i) => ({ ...i, data: applyFormulas(fields, i.data, ctx) })) };
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
  const data = sanitize(fields, raw, { strict: source === "manual", partial: false });
  if (source === "manual") await assertHierarchy(projectId, moduleKey, fields, data);
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
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!isEqualValue(item.data[k], v)) changes[k] = { from: item.data[k] ?? null, to: v };
  }
  if (!Object.keys(changes).length) return { item, changed: false };
  const now = new Date();
  const data = { ...item.data, ...patch };
  if (source === "manual") await assertHierarchy(item.projectId, item.moduleKey, fields, data, item.id);
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
