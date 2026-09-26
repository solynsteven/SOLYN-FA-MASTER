import { AppShell } from "@/components/AppShell";
import { requireSuperAdmin, ROLE_LABEL } from "@/lib/auth";
import { listAccessibleProjects } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  const projects = await listAccessibleProjects(user);
  return (
    <AppShell
      sidebar={{
        user: { name: user.name, email: user.email, globalRole: user.globalRole },
        roleLabel: ROLE_LABEL[user.globalRole],
        projects: projects.map((p) => ({ id: p.id, name: p.name, code: p.code })),
        mode: "admin",
      }}
    >
      {children}
    </AppShell>
  );
}
