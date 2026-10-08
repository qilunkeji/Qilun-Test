# 外部智能体接入

## 最新部署状态（2026-10-08）

用户明确授权“发布最新版，唤醒先留空”后，已发布 `20261008-external-agent-v3`，代码提交 `7f3fe50`，包含人才/测评分组和独立测评（011）。生产为 external_agent；Webhook URL/SECRET 留空，依赖智能体巡检/长轮询。机器接口鉴权和队列读取已公网验证，真实外部智能体唤醒/领取/提交尚未验证。详见 [最新版上线验收](20261008-最新版上线验收.md)。

以下为此前本地准备记录，所述“未上线”和 v1 路径是历史状态，不代表当前生产；不要重新执行历史激活命令。

2026-10-08。分支 codex/external-agent，基线8242a07、基础提交b797357。仅本地Git，无远程、不推送。最终提交与包摘要见 .local/deploy/20261008-external-agent-v1.manifest.json。只有本线程新的“上线”才授权部署，历史授权不适用。

## 本轮完成与验证

通用JSON-RPC十工具、六类业务异步创建/领取/严格校验/提交、唤醒发件箱、可见窗口轮询、负责人连通测试、取消、工作台状态、审计和readiness均接通。010仅追加；001–009、IAM、固定测评、报告词库和H5不变。原模型/费用逻辑保留，默认PROCESSING_MODE=model。

169项自动测试（原134＋新增35）、18组隔离浏览器（原16＋外部异步/手机/设置2组）、类型检查及Vite构建通过，零失败/跳过。本机无npm/Docker，直接用已有Node执行对应命令，未安装依赖。**本地验证不等于服务器Docker或真实Grok已接通。**

候选 .local/deploy/20261008-external-agent-v1/；同级.tgz及manifest。批准的源码/构建/脚本/虚构fixture helper入包；本地node_modules和私有固定测评模型仅作候选链接，不在包内。隔离内存库完整验证六类＋关联面试提问/评估＋ping，共9次领取提交，0模型调用/费用、迁移10、静态页200、assessment.ready=true。实际main.ts在新临时磁盘库启动/关机通过，临时库已清理。服务器未上传、未打开生产库、未修改配置。

## 协议与安全

预定地址 https://rc.iqilun.cn/mcp/agent，本轮未发布。在/api中间件外、SPA前，只接受回环POST和写Bearer；IAM Cookie不可访问。GET/DELETE405；机器token访问/api/*401。JSON-RPC支持initialize、notifications/initialized、ping、tools/list、tools/call；业务result.content[0].text为JSON，错误isError=true。

固定工具：get_queue_status、list_task_types、list_tasks、wait_for_tasks、claim_task、get_task_context、renew_lease、submit_task_result、fail_task、get_task。长轮询最多25秒；本期context_tools全为空，不开放其他档案/联系方式/答案/会话检索。

类型：job_optimize、resume_review、interview_outline、transcript_analysis、comprehensive_review、report_interpretation、agent_ping。不能写岗位/档案/申请状态/测评/面试标准与文稿，不能发布、邀约或录用/淘汰。结果必须人工复核。

任务表仅指针/数值元数据，材料在ai_runs加密快照，结果回执只计数不存正文，审计不存材料。默认打码手机/邮箱/身份证/微信，姓名、薪资、编号和行结构保留；引用校验用同份打码evidence。原引用、rubric、题数、未知项与加权评分复用。关联面试用原strict问题/评估结构；材料助手原有两个同名粘贴功能保留aiOutput，注册Schema为union，validate按服务端快照mode严格选择，关联面试不能绕过。

写工具request_id幂等。为不存明文租约，领取回执仅存随机种子、参数摘要、公开时间/次数；使用凭证摘要作HMAC密钥派生32字节随机租约，只存租约哈希。有效重放返回原租约/时间；租约过期/凭证轮换后拒绝旧回执，不静默再领取。回执限定租户/任务、不存提交正文。取消/到期提交返回SUBJECT_CHANGED并取消任务；等待期间改文稿仍用原快照，界面标历史版本。

## 唤醒与实际连接边界

payload仅event、task_type、task_id、created_at、pending_count、site，site固定rc.iqilun.cn。不含姓名/简历/文稿/岗位/公司材料。HTTPS、不重定向、超时3秒；Authorization发送Bearer，自定义合规头发送原值。页面只显示主机名；日志不存完整URL/密钥/响应正文。

事务后异步投递。退避2/5/15/60秒，“最多4次”按最多4次重试解释，初始加重试共5次，假时钟覆盖；5秒维护及MCP触发sweep。10秒内旧任务仍queued则合并；120秒未领取补发，最多5轮、间隔加倍。未配置记skipped_unconfigured，不发请求、不丢任务，依赖巡检/长轮询。凭证配置不代表连通成功。

真实Webhook尚未提供；真实唤醒、Grok领取/处理秒数和服务器出站限制均未验证，不能把虚构替身通过称为已连接。

## 凭证与配置

Mac已安全生成32字节base64url写token，明文唯一文件 /Users/huangfeihong/.codex/secrets/rc-agent-write.token，0600。不要回显、不要放仓库/日志/上传包。服务器仅存AGENT_WRITE_TOKEN_SHA256。上线时从Mac文件在内存计算摘要，通过SSH stdin的私密配置JSON交给激活脚本；不要把token当命令行参数，不打印JSON。

变量名：PROCESSING_MODE、AGENT_WRITE_TOKEN_SHA256、AGENT_WAKE_WEBHOOK_URL、AGENT_WAKE_WEBHOOK_SECRET、AGENT_WAKE_WEBHOOK_AUTH_HEADER、AGENT_REPLY_HINT_TEXT、AGENT_STALE_ALERT_MINUTES、AGENT_REWAKE_AFTER_SECONDS、AGENT_WAKE_COALESCE_SECONDS、AGENT_TASK_MAX_ATTEMPTS、AGENT_HOURLY_LIMIT_PER_USER、AGENT_MAX_PENDING_PER_USER、AGENT_REDACT_CONTACTS。.env.example无真实值。

计划上线设置external_agent、凭证摘要、示例阈值。没有Webhook就明确留URL/SECRET为空、头名Authorization，依赖巡检。既有变量/账号/加密密钥/IAM不动。production.env由Docker --env-file读取，改后restart服务才生效；本轮未改本地实际.env或服务器env。

## 新增AI功能

1. 在apps/api/agent-tasks/types/编写TaskTypeDef并注册。当前内置types.ts由runtime实例resolver绑定数据库/密钥；禁止捕获密钥的跨实例全局单例。
2. 外部入口同事务创建加密run和指针task，提交后唤醒、返回awaiting_agent；保留角色/授权/保留期限。
3. 页面用GET /ai/runs/:id和usePendingRun，可见时5秒轮询，隐藏暂停，处理中禁止重复提交。
4. 按echo_upper/echo_rpc模板补租约、校验、幂等、取消、失败、角色和0模型调用测试。
5. 不新增MCP路由/工具，不绕过model-guard；list_task_types动态发现。

## 上线步骤（未执行）

1. 新授权后再核对SSH、current/入口SHA/资源、没有并发部署。预期current=/opt/qilun-talent/releases/20261008-report-profile-v2；不一致先停并审查，不覆盖。
2. 上传包至 /opt/qilun-talent/staging/20261008-external-agent-v1.tgz，核对manifest SHA。执行新deploy/activate-external-agent.sh --authorized上线 <包SHA> 20261008-external-agent-v1，配置JSON从stdin输入。不可重跑任何历史activate。
3. 脚本复制旧目录保留依赖/旧资源，覆盖批准包；校验001–009、IAM/计分不变。服务器Docker --network none、空/隔离库验证固定指纹、actual main启动、虚构9次领取提交。
4. 停systemd并确认容器退出后完整shared备份 /opt/qilun-talent/backups/before-20261008-external-agent-v1.tgz，0600；配置另备份production-env-before-20261008-external-agent-v1，0600。单独PGlite先读11表行数并关闭。
5. 仅改allowlist env，保留其他行/权限/属主，原子切换current到 /opt/qilun-talent/releases/20261008-external-agent-v1并启动，010自动追加。健康/资源/SSO跳转/401检查后再短暂停服，单独PGlite对比迁移10/行数，再启动复验。严禁复制活动数据库或另开连接同目录进程。
6. Mac运行deploy/verify-agent-public.mjs，只读验证tools/list、类型、队列、2秒等待，内存读token不打印。检查指定页面/授权/供应商隐藏和日志，生产不提交真实材料作验收。
7. Webhook后补后restart，负责人发送测试唤醒，报告HTTP/领取/提交秒数；失败不改防火墙、不绕过校验。

## 回滚

失败自动停服务、恢复旧current及旧env（原权限/属主），保留最新shared数据库，不解压备份盖新数据。010表留着旧代码忽略。容器未退出则停止、不冒险复制/开库。

仅停外部模式：PROCESSING_MODE=model并restart，原配置/费用恢复；负责人可审计取消等待任务，或留待智能体完成。程序回滚停服后原子切回report-profile-v2及旧env，仍保留最新shared。一次性脚本有目录/备份存在保护，不能重跑；失败后审查并准备新版本。
