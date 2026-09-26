import {
  pgTable, uuid, text, timestamp, boolean, integer, jsonb, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  用户与权限                                                          */
/* ------------------------------------------------------------------ */

/** 全局角色：super_admin = 全局管理员；user = 普通账号（项目内角色见 project_members） */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  globalRole: text("global_role").$type<"super_admin" | "user">().notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  title: text("title"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  项目                                                                */
/* ------------------------------------------------------------------ */

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 项目代号，如 PRJ-QS
  name: text("name").notNull(),
  clientName: text("client_name"),
  dealType: text("deal_type"), // 并购 / 融资 / 投资 ...
  description: text("description"),
  status: text("status").$type<"active" | "on_hold" | "closed">().notNull().default("active"),
  /** 项目级参数，如 { faStartDate: "2026-10-01" }（FA 计划日期以此为基准自动推算） */
  settings: jsonb("settings").$type<ProjectSettings>().notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 项目内角色：project_admin = 项目管理员；member = 普通项目用户 */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"project_admin" | "member">().notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("pm_user_idx").on(t.userId)],
);

/** 每个项目启用哪些业务模块 */
export const projectModules = pgTable(
  "project_modules",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(), // home | fa | dd | fdd | qa | vdr
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.moduleKey] })],
);

/* ------------------------------------------------------------------ */
/*  动态字段 & 任务记录（FA / DD 共用一套引擎，按 module_key 区分）           */
/* ------------------------------------------------------------------ */

export type FieldType =
  | "text" | "longtext" | "number" | "percent" | "date" | "select" | "multiselect" | "boolean" | "user";

/** 字段语义角色：导出 PDF 报告、项目首页统计会按角色找到对应字段 */
export type FieldConfig = { levelParents?: Record<string, string | null> };

export type ProjectSettings = { faStartDate?: string | null };

export type FieldRole = "code" | "title" | "category" | "priority" | "status" | "owner" | "due_date" | "start_date" | "progress" | null;

export const fieldDefinitions = pgTable(
  "field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(), // fa | dd
    key: text("key").notNull(), // 机器键，data jsonb 中的 key
    label: text("label").notNull(), // 显示名（与 Excel 表头对应）
    type: text("type").$type<FieldType>().notNull().default("text"),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    role: text("role").$type<FieldRole>(),
    required: boolean("required").notNull().default(false),
    showInTable: boolean("show_in_table").notNull().default(true),
    width: integer("width").notNull().default(160),
    sortOrder: integer("sort_order").notNull().default(0),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]), // Excel 导入时可匹配的其他表头写法
    /** 计算字段：公式 ID（见 src/lib/formulas.ts）。非空即只读，值在读取时实时计算，不存库 */
    formula: text("formula"),
    /** 字段级配置，如任务等级的从属关系 { levelParents: { "一级任务": "阶段任务", ... } } */
    config: jsonb("config").$type<FieldConfig>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fd_project_module_key").on(t.projectId, t.moduleKey, t.key)],
);

export const trackerItems = pgTable(
  "tracker_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    seq: integer("seq").notNull(), // 项目内顺序号
    externalKey: text("external_key"), // Excel 中的任务编号，用于导入时匹配更新
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    /** 每个字段最近一次被修改的时间：{ fieldKey: ISO 时间 } */
    fieldUpdatedAt: jsonb("field_updated_at").$type<Record<string, string>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // 软删除：删除日期同样被记录
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    importBatchId: uuid("import_batch_id"),
  },
  (t) => [
    index("ti_project_module_idx").on(t.projectId, t.moduleKey),
    index("ti_external_idx").on(t.projectId, t.moduleKey, t.externalKey),
  ],
);

/** 每一次新增 / 修改 / 删除 / 恢复都写一条，changes 记录字段级前后值 */
export const trackerItemChanges = pgTable(
  "tracker_item_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => trackerItems.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    action: text("action").$type<"create" | "update" | "delete" | "restore">().notNull(),
    source: text("source").$type<"manual" | "import">().notNull().default("manual"),
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>().notNull().default({}),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    importBatchId: uuid("import_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tic_item_idx").on(t.itemId),
    index("tic_project_module_idx").on(t.projectId, t.moduleKey, t.createdAt),
  ],
);

/** Excel 导入批次（导入功能在拿到模板后启用） */
export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
  fileName: text("file_name").notNull(),
  mode: text("mode").notNull().default("merge"), // merge | replace
  status: text("status").notNull().default("preview"), // preview | applied | failed
  stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
  payload: jsonb("payload"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/*  Agent API Key（AES-256-GCM 加密存储）                               */
/* ------------------------------------------------------------------ */

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().default("anthropic"),
  label: text("label").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  last4: text("last4").notNull(),
  model: text("model").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  lastTestOk: boolean("last_test_ok"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  后台操作审计（用户、项目、成员、字段、Key 的管理动作）                     */
/* ------------------------------------------------------------------ */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_project_idx").on(t.projectId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type FieldDefinition = typeof fieldDefinitions.$inferSelect;
export type TrackerItem = typeof trackerItems.$inferSelect;
export type TrackerItemChange = typeof trackerItemChanges.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
