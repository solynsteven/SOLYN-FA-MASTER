-- FA：把「状态」字段（role = status）移到「担当」（role = owner）右侧，其余字段顺序不变，按 10 的间隔重新编号
WITH o AS (
  SELECT project_id, sort_order AS owner_order, created_at AS owner_created
  FROM field_definitions WHERE module_key = 'fa' AND role = 'owner'
), ranked AS (
  SELECT fd.id,
         row_number() OVER (
           PARTITION BY fd.project_id
           ORDER BY CASE WHEN fd.role = 'status' AND o.owner_order IS NOT NULL THEN o.owner_order ELSE fd.sort_order END,
                    CASE WHEN fd.role = 'status' AND o.owner_order IS NOT NULL THEN 1 ELSE 0 END,
                    fd.created_at
         ) AS rn
  FROM field_definitions fd
  LEFT JOIN o ON o.project_id = fd.project_id
  WHERE fd.module_key = 'fa'
)
UPDATE field_definitions f SET sort_order = r.rn * 10
FROM ranked r WHERE r.id = f.id;
