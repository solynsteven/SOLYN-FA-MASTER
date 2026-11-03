import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { vdrGroups, vdrSettings, type VdrGroupRow, type VdrSettingsData, type WatermarkField, type VdrCap } from "@/db/schema";
import { BUILTIN_GROUPS } from "./constants";
import { capsOfLevel, DEFAULT_DOWNLOAD_MODES, normCaps } from "./caps";

/** 新项目首次进入 VDR 时建立内置权限组 */
export async function ensureGroups(projectId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(vdrGroups).where(eq(vdrGroups.projectId, projectId));
  if ((r?.n ?? 0) > 0) return;
  await db.insert(vdrGroups).values(BUILTIN_GROUPS.map((g, i) => ({
    projectId, code: g.code, name: g.name, description: g.description, kind: g.kind, defaultLevel: g.defaultLevel, defaultCaps: capsOfLevel(g.defaultLevel), sortOrder: (i + 1) * 10,
  }))).onConflictDoNothing();
}

export async function listGroups(projectId: string): Promise<VdrGroupRow[]> {
  await ensureGroups(projectId);
  return db.select().from(vdrGroups).where(eq(vdrGroups.projectId, projectId)).orderBy(asc(vdrGroups.sortOrder), asc(vdrGroups.code));
}

export const groupDefaultsOf = (groups: VdrGroupRow[]): Record<string, VdrCap[]> => Object.fromEntries(groups.map((g) => [g.code, normCaps(g.defaultCaps)]));

/* ------------------------------ VDR 设置 ------------------------------ */

export const DEFAULT_WM_FIELDS: WatermarkField[] = ["name", "org", "email", "time", "ip", "confidential"];
export const WM_FIELD_LABEL: Record<WatermarkField, string> = {
  name: "用户名", email: "邮箱", org: "所属机构", time: "时间戳", ip: "IP 地址", room: "数据室 ID", project: "项目名称", confidential: "「商业机密」字样",
};

export const DEFAULT_NDA_TITLE = "保密协议（数据室访问）";
export const DEFAULT_NDA = `本保密协议由 {{机构}} 的 {{用户名}}（邮箱：{{邮箱}}，以下称“接收方”）于 {{日期}} 就访问「{{项目名}}」虚拟数据室（数据室 ID：{{数据室ID}}）签署。

一、保密信息
接收方通过本数据室获得的全部文件、数据、问答记录及其衍生资料（以下称“保密信息”），无论是否标注“机密”，均属保密信息。

二、使用限制
1. 保密信息仅可用于评估与本项目相关的交易，不得用于任何其他目的。
2. 未经卖方及其财务顾问书面同意，不得向任何第三方披露、复制、转发或公开保密信息；接收方内部仅可向有知悉必要且负有同等保密义务的人员披露。
3. 不得以拍照、录屏、截图、OCR 或其他方式规避数据室的安全控制。

三、留痕与水印
接收方知悉：本数据室对每次访问、预览、打印与下载进行记录；所有预览与下载副本均嵌入含接收方身份信息的水印；受控副本可被随时远程撤销。

四、返还与销毁
交易终止或应卖方要求时，接收方应立即返还或销毁全部保密信息及其副本。

五、期限
本协议自签署之日起生效，保密义务在交易终止后持续三年。

接收方确认已完整阅读并理解上述条款，以电子签名方式签署，与亲笔签名具有同等效力。`;

export type VdrSettingsView = {
  watermark: { fields: WatermarkField[]; opacity: number; size: number; density: number; customText: string };
  download: { modes: NonNullable<NonNullable<VdrSettingsData["download"]>["modes"]>; irmExpiryDays: number; irmPrintLimit: number };
  requireMfa: boolean;
  ndaRequired: boolean; ndaTitle: string; ndaTemplate: string; ndaVersion: number;
};

export async function getVdrSettings(projectId: string): Promise<VdrSettingsView> {
  const [r] = await db.select().from(vdrSettings).where(eq(vdrSettings.projectId, projectId));
  const d = r?.data ?? {};
  return {
    watermark: {
      fields: d.watermark?.fields?.length ? d.watermark.fields : DEFAULT_WM_FIELDS,
      opacity: d.watermark?.opacity ?? 0.16, size: d.watermark?.size ?? 15, density: d.watermark?.density ?? 1, customText: d.watermark?.customText ?? "",
    },
    download: { modes: d.download?.modes ?? DEFAULT_DOWNLOAD_MODES, irmExpiryDays: d.download?.irmExpiryDays ?? 30, irmPrintLimit: d.download?.irmPrintLimit ?? 0 },
    requireMfa: !!d.requireMfa,
    ndaRequired: r?.ndaRequired ?? false,
    ndaTitle: r?.ndaTitle || DEFAULT_NDA_TITLE,
    ndaTemplate: r?.ndaTemplate || DEFAULT_NDA,
    ndaVersion: r?.ndaVersion ?? 1,
  };
}

export type WmCtx = { name: string; email: string; org: string | null; ip: string; projectName: string; projectCode: string; projectId: string; time?: Date };

/** 水印文字（按项目设置的字段组合），在预览、打印与下载副本中一致 */
export function watermarkText(s: VdrSettingsView["watermark"], c: WmCtx) {
  const t = c.time ?? new Date();
  const time = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(t);
  const parts: string[] = [];
  for (const f of s.fields) {
    if (f === "name") parts.push(c.name);
    else if (f === "email") parts.push(c.email);
    else if (f === "org" && c.org) parts.push(c.org);
    else if (f === "time") parts.push(`${time} JST`);
    else if (f === "ip" && c.ip) parts.push(`IP ${c.ip}`);
    else if (f === "room") parts.push(`VDR-${c.projectCode}-${c.projectId.slice(0, 6).toUpperCase()}`);
    else if (f === "project") parts.push(c.projectName);
    else if (f === "confidential") parts.push("商业机密");
  }
  if (s.customText.trim()) parts.push(s.customText.trim());
  return parts.join(" · ");
}

/** NDA 动态标签替换 */
export function renderNda(tpl: string, c: { name: string; email: string; org: string | null; projectName: string; projectCode: string; projectId: string; date: Date }) {
  const date = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(c.date);
  return tpl
    .replace(/\{\{\s*用户名\s*\}\}/g, c.name)
    .replace(/\{\{\s*邮箱\s*\}\}/g, c.email)
    .replace(/\{\{\s*机构\s*\}\}/g, c.org || "（未填写机构）")
    .replace(/\{\{\s*项目名\s*\}\}/g, c.projectName)
    .replace(/\{\{\s*项目代号\s*\}\}/g, c.projectCode)
    .replace(/\{\{\s*数据室ID\s*\}\}/g, `VDR-${c.projectCode}-${c.projectId.slice(0, 6).toUpperCase()}`)
    .replace(/\{\{\s*日期\s*\}\}/g, date);
}
