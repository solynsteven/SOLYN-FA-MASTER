const L: Record<string, string> = {
  "system.setup": "系统初始化",
  "user.create": "创建用户",
  "user.update": "编辑用户",
  "user.delete": "删除用户",
  "user.reset_password": "重置密码",
  "user.set_projects": "调整用户项目归属",
  "project.create": "创建项目",
  "project.update": "编辑项目信息",
  "project.delete": "删除项目",
  "project.status": "变更项目状态",
  "project.modules": "调整项目启用模块",
  "project.fa_start_date": "修改 FA 项目开始日",
  "import.apply": "Excel 导入",
  "member.add": "添加项目成员",
  "member.update": "修改成员角色",
  "member.remove": "移除项目成员",
  "field.create": "新增字段",
  "field.update": "编辑字段",
  "field.delete": "删除字段",
  "field.reorder": "调整字段顺序",
  "field.reset": "重置字段模板",
  "apikey.create": "新增 API Key",
  "apikey.update": "编辑 API Key",
  "apikey.delete": "删除 API Key",
};
export function actionLabel(a: string) {
  return L[a] ?? a;
}
