"use server";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vdrNdaSignatures } from "@/db/schema";
import { run } from "@/lib/action";
import { vdrContext } from "@/lib/vdr/access";
import { renderNda } from "@/lib/vdr/groups";
import { logVdr } from "@/lib/vdr/events";
import { userAgent } from "@/lib/net";

/** 在线签署 NDA：服务器重新渲染当前版本全文并计算哈希，与签署信息一并留痕 */
export async function signNda(projectId: string, input: { version: number; signedName: string; agree: boolean }) {
  return run(async () => {
    const c = await vdrContext(projectId);
    if (!c) throw new Error("无权访问");
    if (c.fail && c.fail.code !== "nda") throw new Error(c.fail.message);
    const s = c.settings;
    if (!s.ndaRequired) throw new Error("本项目未要求签署 NDA");
    if (input.version !== s.ndaVersion) throw new Error("协议已更新，请刷新页面后重新阅读");
    if (!input.agree) throw new Error("请勾选确认已阅读并同意");
    const name = input.signedName.trim();
    if (name.length < 2) throw new Error("请输入您的姓名作为电子签名");
    if (name.replace(/\s/g, "") !== c.access.user.name.replace(/\s/g, "")) throw new Error(`电子签名须与账号姓名「${c.access.user.name}」一致`);
    const [dup] = await db.select({ id: vdrNdaSignatures.id }).from(vdrNdaSignatures)
      .where(and(eq(vdrNdaSignatures.projectId, projectId), eq(vdrNdaSignatures.userId, c.access.user.id), eq(vdrNdaSignatures.version, s.ndaVersion))).limit(1);
    if (dup) return dup.id;
    const now = new Date();
    const content = renderNda(s.ndaTemplate, { name: c.access.user.name, email: c.access.user.email, org: c.member?.organization ?? null, projectName: c.access.project.name, projectCode: c.access.project.code, projectId, date: now });
    const [sig] = await db.insert(vdrNdaSignatures).values({
      projectId, userId: c.access.user.id, version: s.ndaVersion, title: s.ndaTitle, signedName: name, content,
      contentHash: createHash("sha256").update(content, "utf8").digest("hex"), ip: c.ip || null, userAgent: (await userAgent()) || null, signedAt: now,
    }).returning();
    await logVdr(projectId, c.access.user.id, "nda_sign", { detail: { version: s.ndaVersion, signature: sig.id } });
    revalidatePath(`/p/${projectId}/vdr`, "layout");
    return sig.id;
  }, "已签署，数据室访问已解锁");
}
