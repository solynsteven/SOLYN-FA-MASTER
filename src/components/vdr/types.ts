import type { VdrLevel, VdrCap, VdrSecurity, VdrDownloadMode } from "@/db/schema";

export type VFolder = {
  id: string; parentId: string | null; name: string; isPhase: boolean; sortOrder: number; caps: VdrCap[]; lv: VdrLevel;
  open: boolean; locked: boolean; hasPassword: boolean; openMode: "closed" | "open" | "by_task"; openTaskCode: string | null; openTrigger: "started" | "done";
  security: VdrSecurity | null; createdAt: string;
};
export type VFile = {
  id: string; folderId: string; name: string; size: number; contentType: string | null; caps: VdrCap[]; lv: VdrLevel; preview: "pdf" | "image" | "docx" | "xlsx" | null;
  taskCode: string | null; taskTitle: string | null; ddCode: string | null; ddTitle: string | null; description: string | null; uploadedBy: string; createdAt: string;
  security: VdrSecurity | null; fence: boolean; downloadModes: VdrDownloadMode[];
};
export type VPerm = { targetType: "folder" | "file"; targetId: string; subjectType: "group" | "user"; subject: string; caps: VdrCap[]; expiresAt: string | null };
export type VMember = { id: string; name: string; email: string; role: string; group: string | null; organization: string | null };
export type VGroup = { code: string; name: string; description: string | null; kind: string; defaultCaps: VdrCap[] };
export type CodeOpt = { code: string; title: string };
export type Me = { id: string; name: string; group: string | null; organization: string | null };
