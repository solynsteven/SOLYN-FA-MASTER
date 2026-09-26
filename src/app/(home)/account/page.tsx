import { requireUser, ROLE_LABEL } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { AccountForms } from "./AccountForms";

export const metadata = { title: "账号设置" };

export default async function AccountPage() {
  const u = await requireUser();
  return (
    <>
      <PageHeader eyebrow="Account" title="账号设置" desc={`${u.email} · ${ROLE_LABEL[u.globalRole]}`} />
      <AccountForms name={u.name} title={u.title ?? ""} />
    </>
  );
}
