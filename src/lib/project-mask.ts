import type { Project } from "@/db/schema";

/**
 * 外部成员（买方 / 顾问 / 自定义组 / 外部分享）看到的项目信息：
 * 用「对外显示名称 / 对外代号」替换真实名称与代号，并隐藏委托方、交易类型与简介，避免从项目信息推断出客户。
 */
export const DEFAULT_EXTERNAL_NAME = "Project Data Room";
export const DEFAULT_EXTERNAL_CODE = "VDR";

export function externalProject<P extends Pick<Project, "name" | "code" | "clientName" | "dealType" | "description" | "settings">>(p: P): P {
  const s = p.settings ?? {};
  return {
    ...p,
    name: s.externalName?.trim() || DEFAULT_EXTERNAL_NAME,
    code: s.externalCode?.trim() || DEFAULT_EXTERNAL_CODE,
    clientName: null,
    dealType: null,
    description: null,
  };
}

export const EXTERNAL_GROUP_KINDS = ["buyer", "advisor", "custom"];
