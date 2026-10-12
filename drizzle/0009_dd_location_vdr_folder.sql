-- DD：「保存位置·文件名」改为关联 VDR 文件夹（字段类型 vdrfolder，存文件夹 id）
UPDATE "field_definitions"
SET "type" = 'vdrfolder', "width" = GREATEST("width", 220),
    "aliases" = CASE WHEN "aliases" ? 'VDR文件夹' THEN "aliases" ELSE "aliases" || '["VDR文件夹","VDR 文件夹"]'::jsonb END,
    "updated_at" = now()
WHERE "module_key" = 'dd' AND "key" = 'location' AND "type" = 'text';
--> statement-breakpoint
-- 已有文本值恰好等于本项目某个（唯一的）VDR 文件夹名称时，自动关联到该文件夹；其余保留原文本
UPDATE "tracker_items" ti
SET "data" = ti."data" || jsonb_build_object('location', f."id"::text)
FROM "vdr_folders" f
WHERE ti."module_key" = 'dd' AND ti."deleted_at" IS NULL
  AND f."project_id" = ti."project_id" AND f."deleted_at" IS NULL
  AND f."name" = btrim(ti."data"->>'location')
  AND (SELECT count(*) FROM "vdr_folders" f2 WHERE f2."project_id" = ti."project_id" AND f2."deleted_at" IS NULL AND f2."name" = f."name") = 1;
