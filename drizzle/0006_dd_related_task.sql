-- DD：新增「关联任务／関連タスク」字段（关联 FA 任务编号），插在「变更／改訂」之前；已存在则跳过
INSERT INTO "field_definitions" ("project_id", "module_key", "key", "label", "type", "width", "sort_order", "aliases")
SELECT fd.project_id, 'dd', 'related_task', '关联任务／関連タスク', 'text', 96,
       COALESCE((SELECT f2.sort_order - 5 FROM "field_definitions" f2 WHERE f2.project_id = fd.project_id AND f2.module_key = 'dd' AND f2.key = 'revision'),
                MAX(fd.sort_order) + 10),
       '["关联任务","関連タスク","关联任务编号","任务编号"]'::jsonb
FROM "field_definitions" fd
WHERE fd.module_key = 'dd'
  AND NOT EXISTS (SELECT 1 FROM "field_definitions" x WHERE x.project_id = fd.project_id AND x.module_key = 'dd' AND x.key = 'related_task')
GROUP BY fd.project_id;
