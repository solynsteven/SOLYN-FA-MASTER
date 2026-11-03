import { PageHeader } from "@/components/PageHeader";
import { SecureReader } from "./SecureReader";

export const metadata = { title: "安全阅读器" };

export default function SecureReaderPage() {
  return (
    <>
      <PageHeader eyebrow="IRM · Secure Reader" title="FA MASTER 安全阅读器"
        desc="打开从数据室下载的 IRM 受控文件（.fasec）。文件在本机解密前需联网验证您的身份与权限；管理员撤销或到期后，该文件立即无法再打开。" />
      <SecureReader />
    </>
  );
}
