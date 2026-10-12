# R5 三层对等验收记录（2026-10-12，含同日证据审计修正）

所有结论只基于当日本机机械判据输出，逐项可复现。本文件在证据审计后修订：
此前的"92 端点完成 / 前端完成"表述不准确，以下为实测真实覆盖。

## 已验证属实的层

### 第一层：金样本（引擎对等）——属实
- Java 引擎（qilun-engine）重算 R0 金样本 1200 组：`GOLDEN_JAVA_OK vectors=1200 chain_head=88b5dace...`，与 R0 manifest 一致。
- 复现：`cd backend && mvn -pl qilun-engine test`

### 第二层：API 对等——对已实现子集属实
- `tools/parity/differ.mjs --java`：53 场景 0 差异（2026-10-12 复跑）。
- **端点覆盖实测：旧系统 91 个端点，Java 已实现 46 个**（含 MCP 端点内部 6/10 工具）。
- 未实现清单（约 30 个，R6 前需补齐）：
  - assessment-routes 内部 QA 系列 19 个（rules/evidence/replay 试算）
  - project-routes 5 个（项目组 CRUD/指派/绑定）
  - ai-routes 6 个（POST ai/run、GET ai/runs、ai/runs/:id、POST ai/settings、inherit、agent-test/:id）
  - resume-screens 6 个（批次/轮次/详情/证据/审阅）
  - POST jobs/:id/versions、POST talents/:id/contact-access
- **IAM/OIDC 完全未实现**（见下"切换阻塞项"）。

### 第三层：数据对等——属实
- 2026-10-12 最新生产快照（62MB/601 行）独立终演 ×2：均 `MIGRATION_OK tables=29 rows=601` + `VERIFY_OK`。
- 复现：`scripts/migrate-pglite-to-pg.ts` + `scripts/verify-pg-migration.ts`

### 前端（R4）——核心链路可用，非视图级完成
- 属实：Vue3+ElementPlus 骨架、H5 全链（登记→277 题→自动保存→续答→价值观→提交→报告+PNG导出）、13 个视图、真实浏览器会话证据（登录/答题/自动保存 saved/刷新续答）。
- **实测边界**：13/32 视图；无岗位/简历/面试的创建类 UI；SVG 报告工作室（10 页母版）未移植；quiz 无计时统计。
- `tools/parity/frontend-check.mjs` 是 **API 级**脚本门（经前端代理发同样请求序列），非浏览器门。

## 生产就绪冒烟——降级表述

Java API 用真实生产密钥/令牌/租户挂终演库启动成功（health ok、assessment.ready:true）。
但 **auth/options 返回 local_password_login=true 是因为 Java 未实现 IAM 模式**，
不代表生产行为对等——生产使用 zh.iqilun.cn 统一登录。此前把该返回写作
"生产租户下的登录模式正确返回"是错误解读，特此更正。

## R6 切换阻塞项（必须先完成）

1. **IAM/OIDC 集成**：Spring Security OAuth2 Client（授权码+PKCE、webhook HMAC
   验签、身份映射、会话入 PG）——R1 计划项，未实现。生产统一登录依赖它。
2. **补齐约 30 个端点**（清单见上），重点是 ai/run 与 resume-screens（业务主链）。
3. 前端补齐管理侧创建/编辑流与报告工作室（或切换时明确降级范围并公告）。
4. 服务器升配 ≥4C/8G。

## 切换手册（R6，待上述项完成后执行）

1. 前置：服务器 ≥4C/8G；PG16+Redis 容器就位；IAM 模式在 staging 验证通过
2. 停服窗口：`systemctl stop qilun-talent` → 记录时刻
3. 终快照：tar over SSH 零写入拉取（实测 <60s）
4. 迁移：--recreate → VERIFY_OK（实测 ~5s，窗口预算 30 分钟）
5. 起新栈：docker compose（Java×2 + PG16 + Redis + nginx）
6. 门禁：health ok + assessment.ready + differ 抽查 + IAM 登录实测
7. 回滚：旧栈与 PGlite 目录原样保留；48h 灾难回切 = systemctl start qilun-talent
8. 48h 前向修复后旧栈退役
