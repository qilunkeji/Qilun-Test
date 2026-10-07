# 外部智能体改造记录（本地开发，尚未上线）

2026-10-08。分支 `codex/external-agent`，基线 `8242a07`。没有 Git 远程，不推送。

## 当前完成范围

- 追加迁移 010：任务、回执、唤醒发件箱、智能体审计和状态表；001–009 不改。
- 模式开关、两层禁止直接调用模型的保护、专用 Bearer 凭证校验、回环限制、认证限流。
- 通用任务服务：作用域注册表、唯一创建、领取、租约续期、过期重排、重试上限、提交校验、试验提交、结果提交幂等、取消。
- 六类业务类型和 `agent_ping` 的定义。材料从加密的 run 快照读取；任务表只应存指针；上下文返回字段采用白名单。
- 面试结构从原校验器提取复用；题数、逐字引用、评价项、文稿证据、未知项和服务端加权计分校验不放宽。
- 已取消或到期的 run 提交会取消任务；不得通过回执重放访问其他租户。
- 联系方式打码纯函数、脱敏校验错误、零费用结果落库。

这些类型和服务目前只在隔离测试中调用，**尚未接入真实业务入口**。业务定义按实例绑定加密密钥，不能注册一个捕获密钥的全局单例后让多实例共用。

### 本阶段验证

原134项加新增17项，共151项通过，0失败、0跳过。类型检查和Vite构建通过；前端产物入口哈希与当前UI一致。现有16组隔离浏览器回归通过（只证明原页面未回退，不代表外部异步页面已完成验收）。当前机器没有可执行的npm，直接使用已有Node运行package.json中对应的tsc、Vite和Node测试命令，没有安装依赖。

测试包括六类业务的加密快照/指针任务/非法字段拒绝/试验提交/零费用落库、连通nonce与耗时、到期取消、未知能力不补零、文稿引用和跨租户回执拒绝。原SQL001–009、IAM、固定计分核心及H5均与Git基线无差异。私人日志位于`.local/ui-unification/external-agent-foundation-tests.log`和`external-agent-foundation-browser.log`，不提交。

## 未完成，禁止切换生产

以下仍须实现和验收，不应把本地基础库通过测试当成系统已经接通：

- `/mcp/agent` JSON-RPC 路由及全部通用工具；所有写操作的幂等约定。
- 唤醒投递、合并、退避、再次唤醒、定时 sweep 和实际唤醒链路。
- `/ai/run` 共用材料构建、授权、打码、限流、事务创建 run 与 task；目前外部模式返回 `AGENT_NOT_READY`（凭证未配置时为 `AGENT_NOT_CONFIGURED`），不调用模型。
- `/ai/meta`、单条状态、外部设置、取消入口、审计合并和系统状态。
- 招聘优化、面试、材料助手、设置和工作台的异步 UI 与轮询；外部模式所有接口/页面的供应商信息隐藏。
- 完整 HTTP/MCP、唤醒、页面及 390px 浏览器验收；发布脚本和候选环境验证。

现有模型模式保持默认，生产环境没有变化。不要在当前版本设置 `PROCESSING_MODE=external_agent`；它只会明确阻断未完成的入口，不会变成可用的异步助手。

## 新类型的本地开发方式

1. 编写 `TaskTypeDef`（结构、上下文白名单、原业务校验、条件 apply、失败/取消钩子）。当前内置定义在 `apps/api/agent-tasks/types.ts`。
2. 使用 `AgentTasks` 的实例 resolver 注册业务类型；无密钥的测试插件可用 `registerTaskType`。禁止提供档案、联系方式、测评原始答案或账号检索工具。
3. 业务入口以后须在同一个事务创建加密 run 与指针 task，事务后才唤醒；接口不改动任务类型专用协议。
4. 页面以后通过单条 run 状态接口和可见窗口轮询显示状态。
5. 仿照 `tests/agent-tasks.test.ts` 验证并发、租约、逐字引用、非法字段、幂等、跨租户拒绝、对象到期及零费用；再补端到端 HTTP/MCP 测试。

## 配置约定（仅名称，不含凭据）

`PROCESSING_MODE` 默认 `model`；完成验收后可选择 `external_agent`。

`AGENT_WRITE_TOKEN_SHA256`、`AGENT_WAKE_WEBHOOK_URL`、`AGENT_WAKE_WEBHOOK_SECRET`、`AGENT_WAKE_WEBHOOK_AUTH_HEADER`、`AGENT_REPLY_HINT_TEXT`、`AGENT_STALE_ALERT_MINUTES`、`AGENT_REWAKE_AFTER_SECONDS`、`AGENT_WAKE_COALESCE_SECONDS`、`AGENT_TASK_MAX_ATTEMPTS`、`AGENT_HOURLY_LIMIT_PER_USER`、`AGENT_MAX_PENDING_PER_USER`、`AGENT_REDACT_CONTACTS` 均已列入 `.env.example`。没有实际值写入。

凭证尚未生成。后续部署时重新确认一次性交付方式；此前用户要求明文只交付一次且不写文件，与任务附件要求存本地 token 文件不同，不能擅自两者都执行。服务器只存 SHA-256，不记录明文。Webhook 的占位描述不是实际 URL 或密钥，不可拿来测试或宣称已连接。

`production.env` 由 Docker `--env-file` 读取，变更后须重启服务才生效，不能只 reload。部署前须在本线程获得新的“上线”授权。

## 后续上线和回退要求

先完成上述缺项并全量验收，再写新的、不可重跑的发布脚本。不要重跑历史 activate 脚本。

- 只操作人才站：独立发布目录，候选容器断网和空数据目录启动验证。
- 停服务并确认容器退出后才备份完整 shared，备份权限 0600；不能复制运行中的 PGlite 数据目录。
- 保持生产账号、数据库、上传、IAM、所有已有密钥和其他站点不变。
- 010 自动追加；切换后比对业务行数、测评 ready、固定规则指纹及合成 SHA。
- MCP 候选地址为 `https://rc.iqilun.cn/mcp/agent`，**当前尚未发布该接口**。
- 回退模式为 `model` 并重启；程序回退保留最新 shared，不用备份覆盖新数据，010 表可以留存。
- 当前生产发布基线只读核对为 `20261008-report-profile-v2`；以后切换前必须再次核对，不能把这里的历史记录当成最新状态。
