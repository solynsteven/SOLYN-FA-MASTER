import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { vdrGroups, vdrSettings, type VdrGroupRow, type VdrSettingsData, type WatermarkField, type VdrCap } from "@/db/schema";
import { BUILTIN_GROUPS } from "./constants";
import { NDA_TEMPLATES } from "./nda-templates";
import { capsOfLevel, DEFAULT_DOWNLOAD_MODES, normCaps } from "./caps";

/** 新项目首次进入 VDR 时建立内置权限组 */
export async function ensureGroups(projectId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(vdrGroups).where(eq(vdrGroups.projectId, projectId));
  if ((r?.n ?? 0) > 0) return;
  await db.insert(vdrGroups).values(BUILTIN_GROUPS.map((g, i) => ({
    projectId, code: g.code, name: g.name, description: g.description, kind: g.kind, defaultLevel: g.defaultLevel, defaultCaps: capsOfLevel(g.defaultLevel), sortOrder: (i + 1) * 10,
  }))).onConflictDoNothing();
}

/** 外部分享对象默认：必须先签署 NDA 并开启二次验证（可在安全中心的权限组中调整） */
export const SHARE_DEFAULT_POLICY = { requireNda: true, requireMfa: true };

export async function listGroups(projectId: string): Promise<VdrGroupRow[]> {
  await ensureGroups(projectId);
  const rows = await db.select().from(vdrGroups).where(eq(vdrGroups.projectId, projectId)).orderBy(asc(vdrGroups.sortOrder), asc(vdrGroups.code));
  // 旧版本建立的「外部分享」组没有这两项设置：补上默认值（管理员保存过的明确设置不覆盖）
  for (const g of rows) {
    if (g.code === "SHARE" && g.policy.requireNda === undefined) {
      g.policy = { ...SHARE_DEFAULT_POLICY, ...g.policy, requireNda: true };
      await db.update(vdrGroups).set({ policy: g.policy }).where(eq(vdrGroups.id, g.id));
    }
  }
  return rows;
}

export const groupDefaultsOf = (groups: VdrGroupRow[]): Record<string, VdrCap[]> => Object.fromEntries(groups.map((g) => [g.code, normCaps(g.defaultCaps)]));

/* ------------------------------ VDR 设置 ------------------------------ */

export const DEFAULT_WM_FIELDS: WatermarkField[] = ["name", "org", "email", "time", "ip", "confidential"];
export const WM_FIELD_LABEL: Record<WatermarkField, string> = {
  name: "用户名", email: "邮箱", org: "所属机构", time: "时间戳", ip: "IP 地址", room: "数据室 ID", project: "项目名称", confidential: "「商业机密」字样",
};

export const DEFAULT_NDA_TITLE = NDA_TEMPLATES.zh.title;
export const DEFAULT_NDA = NDA_TEMPLATES.zh.body;

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

/** 数据室 ID：只由项目内部 ID 生成，不含项目代号，避免对外泄露 */
export const roomId = (projectId: string) => `VDR-${projectId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

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
    else if (f === "room") parts.push(roomId(c.projectId));
    else if (f === "project") parts.push(c.projectName);
    else if (f === "confidential") parts.push("商业机密");
  }
  if (s.customText.trim()) parts.push(s.customText.trim());
  return parts.join(" · ");
}

/** NDA 动态标签替换 */
export function renderNda(tpl: string, c: { name: string; email: string; org: string | null; projectName: string; projectCode: string; projectId: string; date: Date }) {
  // 英文模板用英文日期格式，其余用「2026年11月4日」
  const en = !/[\u3040-\u30FF\u4E00-\u9FFF]/.test(tpl.replace(/\{\{[^}]*\}\}/g, "").slice(0, 600));
  const date = new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(c.date);
  return tpl
    .replace(/\{\{\s*用户名\s*\}\}/g, c.name)
    .replace(/\{\{\s*邮箱\s*\}\}/g, c.email)
    .replace(/\{\{\s*机构\s*\}\}/g, c.org || "（未填写机构）")
    .replace(/\{\{\s*项目名\s*\}\}/g, c.projectName)
    .replace(/\{\{\s*项目代号\s*\}\}/g, c.projectCode)
    .replace(/\{\{\s*数据室ID\s*\}\}/g, roomId(c.projectId))
    .replace(/\{\{\s*日期\s*\}\}/g, date);
}
