import type { VdrLevel, VdrGroup } from "@/db/schema";

export type VFolder = {
  id: string; parentId: string | null; name: string; isPhase: boolean; sortOrder: number; level: VdrLevel;
  open: boolean; locked: boolean; hasPassword: boolean; openMode: "closed" | "open" | "by_task"; openTaskCode: string | null; openTrigger: "started" | "done";
  createdAt: string;
};
export type VFile = {
  id: string; folderId: string; name: string; size: number; contentType: string | null; level: VdrLevel; preview: "pdf" | "image" | "docx" | "xlsx" | null;
  taskCode: string | null; taskTitle: string | null; ddCode: string | null; ddTitle: string | null; description: string | null; uploadedBy: string; createdAt: string;
};
export type VPerm = { targetType: "folder" | "file"; targetId: string; subjectType: "group" | "user"; subject: string; level: VdrLevel };
export type VMember = { id: string; name: string; email: string; role: string; group: string | null; organization: string | null };
export type CodeOpt = { code: string; title: string };
export type Me = { id: string; name: string; group: VdrGroup | null; organization: string | null };
