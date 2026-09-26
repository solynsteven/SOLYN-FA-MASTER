import type { FieldType, FieldRole } from "@/db/schema";

export type TField = {
  id: string; key: string; label: string; type: FieldType; options: string[]; role: FieldRole;
  required: boolean; showInTable: boolean; width: number; formula: string | null;
};
export type TItem = {
  id: string; seq: number; data: Record<string, unknown>; fieldUpdatedAt: Record<string, string>;
  createdAt: string; updatedAt: string; updatedByName: string | null;
};
export type TMember = { id: string; name: string };
