import { AppShell } from "@/components/AppShell";
import { requireProject, ROLE_LABEL } from "@/lib/auth";
import { listAccessibleProjects } from "@/lib/queries";
import { MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { user, project, role, canManage, enabledModules } = await requireProject(projectId);
  const projects = await listAccessibleProjects(user);
  return (
    <AppShell
      sidebar={{
        user: { name: user.name, email: user.email, globalRole: user.globalRole },
        roleLabel: ROLE_LABEL[role],
        projects: projects.map((p) => ({ id: p.id, name: p.name, code: p.code })),
        current: {
          id: project.id, name: project.name, code: project.code, canManage,
          modules: MODULES.filter((m) => enabledModules.has(m.key)).map((m) => m.key),
        },
        mode: "project",
      }}
    >
      {children}
    </AppShell>
  );
}
