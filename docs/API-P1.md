# P1 API 契约

统一 `/api/v1`；成功 `{data,request_id}`，失败 `{error:{code,message,fields?},request_id}`。所有业务接口从数据库会话确定租户，客户端不可指定 tenant_id。登录除外，需明确组织以找到所属内部身份。

写请求需要 Origin 与 PUBLIC_ORIGIN 完全一致。登录成功设置 HttpOnly + SameSite=Strict Cookie（HTTPS 时 Secure），返回 CSRF token。其余写请求带 `X-CSRF-Token`。会话 8 小时到期；退出即撤销。组织/用户名/IP 登录尝试限速。开发版本没有密码重置或公开注册 API。

| 方法 | 路径 | 权限与行为 |
|---|---|---|
| GET | /health | 无登录，仅数据库健康、阶段和本地部署标志 |
| POST | /auth/login | tenant_id、username、password；随机 Cookie 会话 |
| GET | /auth/me | 当前用户、角色、组织、CSRF token |
| POST | /auth/logout | 撤销当前会话 |
| GET | /readiness | 已登录；如实列明可用、待开发、待授权 |
| GET | /dashboard | HR/人才负责人；本组织实际数据库计数 |
| GET/POST | /jobs | HR/人才负责人；列表/创建主档与 V1，同事务审计 |
| GET | /jobs/:id | 全部不可变岗位版本 |
| POST | /jobs/:id/versions | 需 expected_revision；冲突 409，创建新版本 |
| POST | /talents/imports | 文本导入，来源与内容哈希幂等 |
| GET | /talents | 未过期授权档案，默认无联系方式 |
| GET | /talents/:id | 主档、来源、简历版本摘要、独立申请 |
| POST | /talents/:id/contact-access | 单独鉴权、解密、审计；不进入列表响应 |
| GET | /resumes/:id | 原文、摘要、行号；同租户且人员未到期 |
| GET/POST | /applications | 申请列表 / 固定人、岗、简历版本，新申请必须岗位当前版本且招聘中 |
| GET | /audit-events | 仅人才负责人/运维；不含材料全文或联系方式 |

列表支持 `page`、`page_size`（1–100）、`q`（200 字以内）；其余查询参数拒绝。当前人才搜索仅按姓名，岗位按标题，申请按姓名/岗位标题；多维筛选、保存视图、列设置尚未实现。UUID 对象参数经过验证。

岗位输入：title、department、owner、location、tasks、criteria、public_jd、status、change_reason。状态 draft/pending/open/paused/closed/archived。选择 open 表示操作者人工确认标准；当前不会对外发布。负责人/部门为文本字段，组织成员与部门实体管理待后续扩展。

导入输入：name、contact（可选）、purpose（recruitment/talent_pool）、processing_basis、retention_until（未来 ISO 时间）、channel、external_id、authorization_ref、filename（.txt）、text_content（最多 20 万字符/5000 行）、completeness（full/summary_only）、candidate_id（可选，仅明确绑定新来源时用）。仅 UTF-8 TXT/粘贴文本；PDF/DOCX/CSV/图片不伪装为已支持。同来源不同姓名/用途拒绝覆盖；新简历不更新已有主档依据/期限/联系信息。

申请输入：candidate_id、job_id、job_version_id、resume_version_id、batch。相同人/岗/批次与相同快照幂等；批次相同但版本不同拒绝，不能静默修改旧申请。人员必须允许本次招聘用途，储备不能自动再激活。P1 申请状态只建立 pending_review，推进与最终决定留至 P4。

HR/人才负责人被明确授予全租户当前业务档案权限；运维仅接入状态和必要审计；面试官在未实现分配对象授权前拒绝业务访问。跨部门/岗位限定角色的细分授权、人格信息访问、导出授权还未实现，不能据 P1 声称全权限体系完备。

版本表由数据库触发器拒绝 UPDATE。跨租户与人/岗位错绑同时有应用校验及组合外键；PGlite 当前运行账户是库所有者，没有将其宣传为已配置 RLS。业务读写权限在服务端检查。
