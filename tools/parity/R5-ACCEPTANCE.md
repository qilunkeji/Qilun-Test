# R5 三层对等验收记录（2026-10-12）

所有结论只基于当日本机机械判据输出，逐项可复现。

## 第一层：金样本（引擎对等）

- Java 引擎（qilun-engine）重算 R0 金样本 1200 组：`GOLDEN_JAVA_OK vectors=1200 chain_head=88b5dacee547a7acbc8725ac6ed73062536048f674137a5fc611a9f21b046efe`
- 链头与 R0 提交的 manifest.json 完全一致；报告含中文文本与数值渲染逐字节相同。
- 复现：`cd backend && mvn -pl qilun-engine test`（需 .local 模型与 tools/golden/vectors.jsonl）

## 第二层：API 对等（differ 53 场景）

- `tools/parity/differ.mjs --java`：legacy(TS/Express) vs Java(Spring Boot) 双系统同机对打
- 最新结果：`scenarios=53 diffs=0 PARITY_OK`（2026-10-12 复跑）
- 覆盖：认证/健康/首页/岗位/人才/申请/简历链(导入+扩展)/测评全链(入口→登记→答题→提交→幂等)/招聘资料/面试/智能体队列+MCP/审计
- 复现：`JAVA_BIN=<jdk>/bin/java.exe node --experimental-strip-types tools/parity/differ.mjs --java`

## 第三层：数据对等（生产快照终演）

- 快照：2026-10-12 从服务器零写入拉取（62MB，tar over SSH），行数 601（较 R0 时 574 增长，业务在继续写入）
- 终演 1：`MIGRATION_OK tables=29 rows=601` + `VERIFY_OK`（全表行数+MD5 哈希+业务抽检一致）
- 终演 2（独立重演）：`MIGRATION_OK tables=29 rows=601` + `VERIFY_OK`
- 周演日志：tools/rehearsal/log.md（每周快照→迁移→对账不断线）
- 复现：`node --experimental-strip-types scripts/migrate-pglite-to-pg.ts --source <快照> --target <url> --recreate` + `scripts/verify-pg-migration.ts`

## 生产就绪冒烟（迁移数据 + 真实生产配置）

- Java API 挂载终演库 + 私密包 production.env 的真实 CONTACT_ENCRYPTION_KEY / AGENT_WRITE_TOKEN_SHA256 / DEFAULT_TENANT_ID 启动：
  - `/api/v1/health` → `{"status":"ok","database":"postgresql","assessment":{"ready":true}}`
  - `/api/v1/auth/options` → 200（生产租户下的登录模式正确返回）
- 说明：存量密文使用生产密钥可解（R0 已证），此处验证 API 在真实配置下可启动并服务。

## 前端验收（R4）

- `tools/parity/frontend-check.mjs`：`FRONTEND_CHECK_OK`（9 项 PASS：api-health/frontend-serves/login/invite-create/enroll/quiz-package(277)/draft-save/submit-report(28能力)/spa-route）
- 浏览器实测（IAB Playwright）：登录→建链接→登记→277题作答→自动保存 saved→刷新续答恢复

## 切换手册（R6 执行清单，待服务器升配后执行）

1. 前置检查：服务器 ≥4C/8G；PG16 容器与 Redis 容器就位；镜像构建并推送
2. 停服窗口开始：`systemctl stop qilun-talent` → 记录停服时刻
3. 终快照：`tar cf - database`（零写入拉取，预计 <60s）
4. 迁移：migrate-pglite-to-pg --recreate → 对账 VERIFY_OK（实测 ~5s，窗口预算 30 分钟）
5. 起新栈：docker compose up（Java×2 + PG16 + Redis + nginx）
6. 健康门禁：/api/v1/health ok 且 assessment.ready=true；differ --a <旧栈备份地址> --b https://rc.iqilun.cn 抽查
7. 回滚预案：新栈保留旧 PGlite 数据目录不动；48h 内灾难级故障回切 = systemctl start qilun-talent（旧栈原样）；切换点后的人工数据合并量 ≈ 数百行级，可行
8. 观察期 48h 前向修复；之后旧栈退役归档
