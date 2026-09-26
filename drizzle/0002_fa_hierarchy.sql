ALTER TABLE "field_definitions" ADD COLUMN IF NOT EXISTS "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- FA：No. 更名为「任务编号」，保留 No. 作为 Excel 表头别名
UPDATE "field_definitions" SET "label" = '任务编号', "aliases" = "aliases" || '["No."]'::jsonb, "updated_at" = now()
WHERE "module_key" = 'fa' AND "key" = 'code' AND "label" = 'No.';
--> statement-breakpoint
-- FA：任务等级默认从属关系
UPDATE "field_definitions" SET "config" = '{"levelParents":{"阶段任务":null,"一级任务":"阶段任务","二级任务":"一级任务"}}'::jsonb, "updated_at" = now()
WHERE "module_key" = 'fa' AND "key" = 'level' AND "config" = '{}'::jsonb;
--> statement-breakpoint
-- FA：新增计算字段「上级任务」（由任务编号推导），放在任务等级之后
INSERT INTO "field_definitions" ("project_id", "module_key", "key", "label", "type", "formula", "width", "sort_order", "aliases", "options", "show_in_table")
SELECT l."project_id", 'fa', 'parent_code', '上级任务', 'text', 'fa_parent_code', 96, l."sort_order" + 5, '["上级任务编号"]'::jsonb, '[]'::jsonb, true
FROM "field_definitions" l
WHERE l."module_key" = 'fa' AND l."key" = 'level'
  AND NOT EXISTS (SELECT 1 FROM "field_definitions" x WHERE x."project_id" = l."project_id" AND x."module_key" = 'fa' AND x."key" = 'parent_code');
