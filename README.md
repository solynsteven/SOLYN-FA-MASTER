# SOLYN FA MASTER

Solyn Advisory 投融资并购 FA 工作平台。Next.js 15（App Router）+ Drizzle ORM + Neon Postgres，部署于 Vercel。

## 当前版本（v0.7）

| 模块 | 状态 |
|---|---|
| 登录 / 首次初始化 / 账号设置 | ✅ |
| 三级权限：全局管理员 / 项目管理员 / 项目用户 | ✅ |
| 全局管理后台：用户、项目增删、Agent API Key（加密存储、连通性测试）、操作日志 | ✅ |
| 项目管理：成员与角色、启用模块、FA / DD 字段定义（文本、数字、百分比、日期、下拉单选/多选、是否、成员） | ✅ |
| FA 项目管理：任务跟踪表增删改、字段级更新日期、变更时间线、软删除与恢复 | ✅ |
| DD 管理：材料收集跟踪表（同上） | ✅ |
| 字段模板按 Project Aoyama 两份 Excel 确定（FA 18 列 / DD 15 列，中日双语选项） | ✅ |
| 计算字段：计划开始/完成日（随项目开始日平移）、延迟天数、材料前缀编码 | ✅ |
| Excel 导入 Skill：solyn-skill-fa-pm-import / solyn-skill-fa-dd-import（差异预览 → 确认写入，合并 / 完全同步） | ✅ |
| 导出 Excel 跟踪表（含进度汇总、变更记录，可再次导入）/ PDF 完成情况报告 | ✅ |
| 项目首页 Dashboard：FA（阶段任务数与完成度、延期、3 天内到期、状态占比）/ DD（分类收集情况、提出状态、必要度、必须材料待跟进） | ✅ |
| VDR 虚拟数据室：Phase 区（独立密码、按项目进度开放）、多级目录、权限组 / 用户 × 目录 / 文件四级权限（✕ / V / P / O）、水印在线预览（PDF、图片、Word、Excel）、上传删除日志、回收站、FA 任务编号 / DD 材料编码关联、访问分析与 PDF 报告 | ✅ |
| Q&A 管理 · 问答跟踪：按《QA问答进度跟踪表》13 列建表，权限组 ADM > SEL > EXC > DD 逐级放大的行级权限，导入 Skill solyn-skill-qa-dd-import，Excel 跟踪表 / PDF 完成情况报告（仅含导出人有权阅读的记录） | ✅ |
| Q&A 管理 · 项目知识库：带权限组的「Q&A 文件区」、.md 上传与版本、关键字 + 模糊匹配检索 Q&A 记录与文件段落、Markdown 阅读与定位 | ✅ |
| Q&A 管理 · AI 智能问答：按权限组取资料、调用后台设定的 Claude 模型流式作答并标注出处（[Q12] / [D3.5]），按用户保存历史，导出完整报告 PDF 与小结 PDF | ✅ |
| FDD | 🗓 规划中（界面已占位） |

## 部署步骤

1. **Neon**：新建项目 → 复制 *Pooled connection* 连接串。
2. **GitHub**：把本目录推送到仓库。
   ```bash
   git init && git add . && git commit -m "SOLYN FA MASTER v0.1"
   git remote add origin git@github.com:<org>/solyn-fa-master.git
   git push -u origin main
   ```
3. **Vercel**：Import 该仓库，Framework 选 Next.js，并设置：
   - Environment Variables：`DATABASE_URL`、`AUTH_SECRET`、`ENCRYPTION_KEY`（说明见 `.env.example`）
   - Build Command 改为：`npm run vercel-build`（每次部署前自动执行数据库迁移）
4. 部署完成后访问站点，首次会进入 **/setup** 创建第一个全局管理员。

5. **VDR 文件存储（Vercel Blob）**：Vercel 项目 → Storage → Create → **Blob** → Access 选 **Private** → Connect 到本项目（自动注入 `BLOB_READ_WRITE_TOKEN`）→ Redeploy。未配置时本地开发会存到 `.data/vdr`。

> `ENCRYPTION_KEY` 用于加密 API Key，设置后不要更改，否则已保存的 Key 需要重新录入。

## Excel 导入说明

- 在 FA / DD 页面点「导入 Excel」上传 `.xlsx`（≤ 4MB，Vercel 请求体上限）。
- 系统按 **No.** 与现有记录比对，预览新增 / 更新 / 删除后再确认写入；每条变更记录日期与来源（Excel 导入）。
- **合并**：只新增和更新；**完全同步**：以文件为准，删除文件中没有的记录（软删除，可在变更记录中恢复）。
- 默认空单元格不覆盖网站中已有值；下拉值不在选项中时可自动补充选项。
- 表头写法与模板不同时：先按字段名 / 别名 / 近似匹配，仍无法识别且已配置 API Key 时调用 Claude 映射。
- 导出的 Excel 可直接再次导入（往返一致）。

## VDR 使用说明

- **成员设置**：项目管理 → 成员，为每个成员选择 VDR 权限组（ADM 卖方 FA / SEL 卖方及顾问 / BID1 / BID2 / EXC / DD）并填写所属机构；访问分析按「所属机构」对比买家。
- **Phase 区**：顶层目录，由项目管理员创建；可设独立密码，开放方式为关闭 / 开放 / 按 FA 任务（指定任务编号开始或完成后自动开放）。
- **权限**：就近规则优先——文件（用户 > 权限组）→ 所在目录逐级向上 → 默认（ADM = O，其余 = ✕）。✕ 不可见、V 仅在线查看、P 可打印、O 可下载原件；文件名按权限着色。管理员可用「以权限组视角预览」检查效果。
- **删除与恢复**：VDR 中删除为软删除，在 项目管理 → VDR 回收站 恢复或彻底删除；每个目录的上传 / 删除 / 重命名均有带时间戳的操作记录。
- **访问分析**：VDR → 访问分析，统计 90 天内阅览 / 打印 / 下载，识别被反复查看的文件（同一用户 ≥ 3 次）与突然停止访问的买家（近 3 天 0 次、此前 4–14 天 ≥ 5 次），可导出 PDF 报告。

## Q&A 使用说明

- **权限组**：与 VDR 共用成员的「权限组」设置。Q&A 只识别 ADM（卖方 FA）> SEL（卖方及顾问）> EXC（独家谈判对象）> DD（买方尽调顾问），标为某组的内容该组及以上可见；BID1 / BID2 看不到 Q&A；项目管理员视为 ADM。
- **问答跟踪**：导入《QA问答进度跟踪表》（按「#」匹配）；「权限组」为空的问题按 ADM 处理；手工修改时「更新日期」自动更新；解决率 = 已解决 ÷（总数 − 已无效）。
- **项目知识库**：项目管理员新建「Q&A 文件区」并设定权限组，上传 .md（同名文件作为新版本覆盖）。搜索同时覆盖可见的 Q&A 记录与文件段落。
- **AI 智能问答**：需在全局管理后台配置并设为默认的 Anthropic API Key。AI 只读取提问人权限组可见的资料；资料总量不大时全部提供给模型，较多时按相关度选取。回答中的 [Q12] 指 Q&A 记录 #12，[D3.5] 指文件 D3 第 5 段，点击可打开原文。对话按用户保存，项目管理员可查看全部用户的对话。

## 本地开发

```bash
cp .env.example .env      # 填入连接串与密钥
npm install
npm run db:migrate
npm run dev               # http://localhost:3000
```

修改 `src/db/schema.ts` 后执行 `npm run db:generate` 生成新的迁移文件并提交。

## 目录

```
src/app/(auth)        登录、初始化
src/app/(home)        我的项目、账号设置
src/app/admin         全局管理后台
src/app/p/[projectId] 项目内：首页、[module] 业务模块、settings 项目管理
src/lib/tracker.ts    FA/DD 通用任务引擎（字段校验、差异计算、变更日志）
src/db/schema.ts      数据库结构
skills/               导入 Skill 说明（SKILL.md，同时作为 Claude 兜底映射的 system prompt）
src/skills/           导入 Skill 的确定性规则
src/lib/import        Excel 解析、表头映射、差异计算
src/lib/export        Excel / PDF 报告生成
src/lib/vdr           VDR 权限解析、存储、事件日志、访问分析
src/lib/qa            Q&A 权限组、知识库切分与检索、AI 提示词与会话
src/components/vdr    VDR 界面（目录树、权限矩阵、水印预览器、访问分析）
assets/fonts          PDF 字体（思源黑体 SC 子集 + Jost，SIL OFL）
public/brand          品牌 Logo（深色底用 logo-white，浅色底用 logo-dark）
```

## 设计规范

色彩、字体取自《Solyn Advisory 品牌手册 v1.0》：Solyn Green `#275642`、Deep Pine `#16362A`、Mid Green `#3F6E58`、Sage `#7C9A8B`、Mist `#D7E0DA`、Paper `#FAF8F4`；英文 Jost、中文思源黑体（Noto Sans SC）。深色界面的底色由 Deep Pine 同色相加深得到，未引入新色相。
