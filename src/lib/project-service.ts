import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, projectModules, fieldDefinitions } from "@/db/schema";
import { DEFAULT_FIELDS } from "./fields";
import { MODULES, TRACKER_MODULES, type TrackerModuleKey } from "./modules";

export async function createProjectWithDefaults(
  input: { code: string; name: string; clientName?: string | null; dealType?: string | null; description?: string | null },
  enabledModules: string[],
  createdBy: string,
) {
  const [p] = await db
    .insert(projects)
    .values({ ...input, code: input.code.trim().toUpperCase(), createdBy })
    .returning();
  await db.insert(projectModules).values(MODULES.map((m) => ({ projectId: p.id, moduleKey: m.key, enabled: enabledModules.includes(m.key) })));
  for (const mk of TRACKER_MODULES) await seedDefaultFields(p.id, mk);
  return p;
}

export async function seedDefaultFields(projectId: string, moduleKey: TrackerModuleKey) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.projectId, projectId), eq(fieldDefinitions.moduleKey, moduleKey)));
  if ((r?.n ?? 0) > 0) return;
  await db.insert(fieldDefinitions).values(
    DEFAULT_FIELDS[moduleKey].map((f, i) => ({
      projectId, moduleKey, key: f.key, label: f.label, type: f.type, role: f.role ?? null,
      options: f.options ?? [], required: f.required ?? false, width: f.width ?? 160, showInTable: f.showInTable ?? true,
      formula: f.formula ?? null, aliases: f.aliases ?? [], config: f.config ?? {},
      sortOrder: (i + 1) * 10,
    })),
  );
}

export async function touchProject(projectId: string) {
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
}
