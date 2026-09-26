import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/db";
import { vdrFolders, vdrFiles, vdrPermissions, projectMembers, trackerItems, fieldDefinitions } from "@/db/schema";
import type { VdrFolder, VdrGroup } from "@/db/schema";
import type { Viewer } from "./resolve";
import { statusKind } from "@/lib/status";

export type { Viewer };

export async function loadViewer(projectId: string, userId: string, canManage: boolean): Promise<Viewer> {
  const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return { userId, isManager: canManage, group: (m?.vdrGroup as VdrGroup) ?? null, organization: m?.organization ?? null };
}

export async function loadVdr(projectId: string, opts: { includeDeleted?: boolean } = {}) {
  const [folders, files, perms] = await Promise.all([
    db.select().from(vdrFolders).where(opts.includeDeleted ? eq(vdrFolders.projectId, projectId) : and(eq(vdrFolders.projectId, projectId), isNull(vdrFolders.deletedAt))),
    db.select().from(vdrFiles).where(opts.includeDeleted ? eq(vdrFiles.projectId, projectId) : and(eq(vdrFiles.projectId, projectId), isNull(vdrFiles.deletedAt))),
    db.select().from(vdrPermissions).where(eq(vdrPermissions.projectId, projectId)),
  ]);
  return { folders, files, perms };
}

/** FA 任务状态（用于 Phase 按进度自动开放） */
export async function faTaskStatuses(projectId: string) {
  const fields = await db.select().from(fieldDefinitions).where(and(eq(fieldDefinitions.projectId, projectId), eq(fieldDefinitions.moduleKey, "fa")));
  const codeK = fields.find((f) => f.role === "code")?.key;
  const statusK = fields.find((f) => f.role === "status")?.key;
  const rows = await db
    .select({ data: trackerItems.data })
    .from(trackerItems)
    .where(and(eq(trackerItems.projectId, projectId), eq(trackerItems.moduleKey, "fa"), isNull(trackerItems.deletedAt)));
  const m = new Map<string, string>();
  if (codeK && statusK) for (const r of rows) m.set(String(r.data[codeK] ?? "").trim(), String(r.data[statusK] ?? ""));
  return m;
}

export function phaseIsOpen(p: VdrFolder, taskStatus: Map<string, string>) {
  if (p.openMode === "open") return true;
  if (p.openMode === "closed") return false;
  const st = p.openTaskCode ? taskStatus.get(p.openTaskCode.trim()) : undefined;
  if (st === undefined) return false;
  const k = statusKind(st);
  return p.openTrigger === "done" ? k === "done" : k === "done" || k === "progress" || k === "partial";
}

export { makeResolver } from "./resolve";

/* ------------------------------ Phase 密码 ------------------------------ */

const key = () => new TextEncoder().encode((process.env.AUTH_SECRET ?? "") + ":vdr-phase");
const cookieName = (phaseId: string) => `vdr_ph_${phaseId.replace(/-/g, "").slice(0, 16)}`;

export async function setPhaseUnlocked(phase: VdrFolder, userId: string) {
  const token = await new SignJWT({ p: phase.id, v: phase.passwordVersion, u: userId })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(key());
  (await cookies()).set(cookieName(phase.id), token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
}

export async function isPhaseUnlocked(phase: VdrFolder, userId: string) {
  if (!phase.passwordHash) return true;
  const t = (await cookies()).get(cookieName(phase.id))?.value;
  if (!t) return false;
  try {
    const { payload } = await jwtVerify(t, key());
    return payload.p === phase.id && payload.v === phase.passwordVersion && payload.u === userId;
  } catch {
    return false;
  }
}
