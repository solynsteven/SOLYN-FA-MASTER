-- FA：计划开始日改为手工日期，開始D+ 改为自动计算（= 计划开始日 − 项目开始日）
-- 1) 已有任务：按「项目开始日 + 開始D+」把原先计算出的计划开始日写入数据（已有值则保留）
UPDATE "tracker_items" ti
SET "data" = ti."data" || jsonb_build_object(
      'plan_start',
      to_char((p."settings"->>'faStartDate')::date + round((ti."data"->>'start_offset')::numeric)::int, 'YYYY-MM-DD'))
FROM "projects" p, "field_definitions" fd
WHERE p."id" = ti."project_id"
  AND ti."module_key" = 'fa'
  AND fd."project_id" = ti."project_id" AND fd."module_key" = 'fa' AND fd."key" = 'plan_start' AND fd."formula" = 'fa_plan_start'
  AND COALESCE(ti."data"->>'plan_start', '') = ''
  AND (p."settings"->>'faStartDate') ~ '^\d{4}-\d{2}-\d{2}$'
  AND (ti."data"->>'start_offset') ~ '^-?\d+(\.\d+)?$';
--> statement-breakpoint
-- 2) 字段定义：计划开始日去掉公式；開始D+ 改为计算列
UPDATE "field_definitions" SET "formula" = NULL, "width" = GREATEST("width", 120), "updated_at" = now()
WHERE "module_key" = 'fa' AND "key" = 'plan_start' AND "formula" = 'fa_plan_start';
--> statement-breakpoint
UPDATE "field_definitions" SET "formula" = 'fa_start_offset', "type" = 'number', "updated_at" = now()
WHERE "module_key" = 'fa' AND "key" = 'start_offset' AND "formula" IS NULL;
