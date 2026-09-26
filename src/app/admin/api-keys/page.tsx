import { desc } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { PageHeader } from "@/components/PageHeader";
import { ApiKeysClient } from "./ApiKeysClient";

export const metadata = { title: "Agent API Key" };

export default async function ApiKeysPage() {
  const rows = await db.select().from(apiKeys).orderBy(desc(apiKeys.isDefault), desc(apiKeys.createdAt));
  return (
    <>
      <PageHeader
        eyebrow="Agent · Claude API"
        title="Agent API Key"
        desc="Agent 与导入 Skill 调用 Claude 时使用的 Anthropic API Key。Key 以 AES-256-GCM 加密存储，页面只显示末 4 位。"
      />
      <ApiKeysClient
        keys={rows.map((k) => ({
          id: k.id, label: k.label, last4: k.last4, model: k.model, isActive: k.isActive, isDefault: k.isDefault,
          lastTestedAt: k.lastTestedAt?.toISOString() ?? null, lastTestOk: k.lastTestOk, createdAt: k.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
