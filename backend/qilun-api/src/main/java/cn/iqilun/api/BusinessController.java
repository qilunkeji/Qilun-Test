package cn.iqilun.api;

import cn.iqilun.common.Db;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * R2-A endpoints ported verbatim from apps/api/app.ts:167-277 — readiness,
 * dashboard, jobs/talents/applications lists and audit-events. SQL strings are
 * byte-identical to the legacy handlers; list-input defaults mirror
 * contracts.listInput (page=1, page_size=20, q='').
 */
@RestController
public class BusinessController {

    private final Db db;

    public BusinessController(Db db) { this.db = db; }

    static void allowBusiness(HttpServletRequest request) {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("talent_lead", "hr").contains(auth.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
    }

    static void allowedKeys(HttpServletRequest request, String... allowed) {
        for (String key : request.getParameterMap().keySet()) {
            if (!List.of(allowed).contains(key))
                throw new ApiError(400, "INVALID_QUERY", "查询条件无效");
        }
    }

    static final class ListInput {
        final long page, pageSize;
        final String q;
        ListInput(HttpServletRequest request) {
            this.page = longParam(request, "page", 1L, 1L, null);
            this.pageSize = longParam(request, "page_size", 20L, 1L, 100L);
            String q = request.getParameter("q");
            if (q != null && q.length() > 200) throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
            this.q = q == null ? "" : q;
        }
        long offset() { return (page - 1) * pageSize; }
    }

    static long longParam(HttpServletRequest request, String name, long dflt, Long min, Long max) {
        String raw = request.getParameter(name);
        if (raw == null || raw.isEmpty()) return dflt;
        long value;
        try {
            value = Long.parseLong(raw);
        } catch (NumberFormatException e) {
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        }
        if (min != null && value < min || max != null && value > max)
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        return value;
    }

    static Map<String, Object> listPage(List<Object> items, long total, ListInput input) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", input.page);
        out.put("page_size", input.pageSize);
        return out;
    }

    // ---------------------------------------------------------------- readiness
    @GetMapping("/api/v1/readiness")
    public Map<String, Object> readiness(HttpServletRequest request) {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        boolean externalAgent = "external_agent".equals(System.getenv("PROCESSING_MODE"));
        boolean agentConfigured = System.getenv("AGENT_WRITE_TOKEN_SHA256") != null
            && System.getenv("AGENT_WRITE_TOKEN_SHA256").matches("(?i)^[a-f0-9]{64}$");
        List<Object> features = new ArrayList<>();
        features.add(feature("岗位、档案与申请", "available", "本地持久化业务；人工导入 UTF-8 TXT / 文本"));
        features.add(feature("BOSS 渠道", "waiting_for_authorization", "未取得真实平台许可与接口；使用人工导入"));
        if ("talent_lead".equals(auth.role()))
            features.add(feature("高禾原版兼容测评", "blocked_missing_rules", "测评后台提供依据、已知公式试算和服务端阻塞校验；完整计分与匹配仍缺规则"));
        features.add(feature("齐论测评与手机 H5", "available", "新邀请使用固定成品V1.0，完整七模块与28项能力参考评分；保留历史邀请版本。多人共用链接、免访问码登记、独立答卷与自动保存续答已实现；能力不是实际技能或绩效，不作心理诊断或自动录用依据。"));
        if (externalAgent) {
            features.add(feature("AI 功能", agentConfigured ? "available" : "waiting_for_configuration",
                agentConfigured ? "由齐论人才系统接入的 AI 助手（外部智能体）异步处理，通常 1–3 分钟；结果保留引用并需人工复核，无模型费用。" : "外部智能体未配置；不会自动使用其他处理方式。"));
            features.add(feature("招聘优化与面试评估", agentConfigured ? "available" : "waiting_for_configuration",
                "提问与证据评估交由 AI 助手异步处理；测评不参与匹配分，缺证据不按零分，需人工复核；音频转写未实现。"));
        } else {
            features.add(feature("AI 功能与费用", "requires_model", "已实现分功能配置、加密Key、引用校验、预算及调用记录；配置不代表供应商连接健康，真实生成需模型配置与本次材料外传许可。"));
            features.add(feature("招聘优化与面试评估", "requires_model", "本地资料库、需求表单、面试档案及文本保存已实现；提问与证据评估依赖外部模型。测评不参与匹配分，缺证据不按零分，需人工复核；音频转写未实现。"));
        }
        features.add(feature("员工档案与全局物理删除", "planned_P4", "尚未完整实现；到期数据当前只限制访问，未声明已完成全局删除"));
        features.add(feature("任务队列与渠道批量", externalAgent ? "available" : "planned_P5",
            externalAgent ? "AI 任务队列支持租约、引用校验与受限重试；渠道批量尚未实现，没有抓取或处理量承诺。" : "尚未实现；没有抓取或处理量承诺"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stage", "P1");
        out.put("features", features);
        return out;
    }

    private static Map<String, Object> feature(String name, String status, String detail) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("name", name);
        f.put("status", status);
        f.put("detail", detail);
        return f;
    }

    // ---------------------------------------------------------------- dashboard
    @GetMapping("/api/v1/dashboard")
    public Map<String, Object> dashboard(HttpServletRequest request) throws Exception {
        allowBusiness(request);
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        List<Map<String, Object>> rows = db.query("""
            SELECT
              (SELECT count(*)::int FROM jobs WHERE tenant_id=$1) AS jobs,
              (SELECT count(*)::int FROM candidates WHERE tenant_id=$1 AND retention_until>now()) AS candidates,
              (SELECT count(*)::int FROM applications a JOIN candidates c ON c.id=a.candidate_id AND c.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND c.retention_until>now()) AS applications,
              (SELECT count(*)::int FROM candidates WHERE tenant_id=$1 AND retention_until<=now()) AS expired""".replace("$1", "$1"),
            auth.tenantId());
        return rows.get(0);
    }

    // ---------------------------------------------------------------- jobs list
    @GetMapping("/api/v1/jobs")
    public Map<String, Object> jobs(HttpServletRequest request) throws Exception {
        allowBusiness(request);
        allowedKeys(request, "page", "page_size", "q");
        ListInput input = new ListInput(request);
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        String base = "FROM jobs j JOIN job_versions v ON v.tenant_id=j.tenant_id AND v.job_id=j.id AND v.version=j.revision WHERE j.tenant_id=$1 AND v.title ILIKE $2";
        List<Map<String, Object>> items = db.query(
            "SELECT j.id,j.revision,v.title,v.department,v.owner,v.location,v.status,v.id AS version_id,j.created_at " + base + " ORDER BY j.created_at DESC,j.id LIMIT $3 OFFSET $4",
            auth.tenantId(), "%" + input.q + "%", input.pageSize, input.offset());
        long total = ((Number) db.query("SELECT count(*)::int AS count " + base, auth.tenantId(), "%" + input.q + "%").get(0).get("count")).longValue();
        return listPage(new ArrayList<>(items), total, input);
    }

    // ---------------------------------------------------------------- talents list
    @GetMapping("/api/v1/talents")
    public Map<String, Object> talents(HttpServletRequest request) throws Exception {
        allowBusiness(request);
        for (String key : request.getParameterMap().keySet()) {
            if (!List.of("page", "page_size", "q", "group").contains(key))
                throw new ApiError(400, "INVALID_QUERY", "查询条件无效");
        }
        String group = request.getParameter("group");
        if (group != null && !group.equals("ungrouped") && !group.matches("(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        ListInput input = new ListInput(request);
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        String base = "FROM candidates WHERE tenant_id=$1 AND retention_until>now() AND name ILIKE $2"
            + ("ungrouped".equals(group) ? " AND project_group_id IS NULL" : group != null ? " AND project_group_id=$5" : "");
        List<Object> params = new ArrayList<>(List.of(auth.tenantId(), "%" + input.q + "%"));
        if (group != null && !"ungrouped".equals(group)) params.add(group);
        List<Map<String, Object>> items = db.query(
            "SELECT id,name,purpose,retention_until,created_at,project_group_id " + base + " ORDER BY created_at DESC,id LIMIT $3 OFFSET $4",
            joinParams(auth.tenantId(), "%" + input.q + "%", input.pageSize, input.offset(), group != null && !"ungrouped".equals(group) ? group : null));
        long total = ((Number) db.query(
            "SELECT count(*)::int AS count " + base.replace("$5", "$3"),
            joinParams(auth.tenantId(), "%" + input.q + "%", group != null && !"ungrouped".equals(group) ? group : null)).get(0).get("count")).longValue();
        return listPage(new ArrayList<>(items), total, input);
    }

    private static Object[] joinParams(Object... values) {
        List<Object> out = new ArrayList<>();
        for (Object v : values) if (v != null) out.add(v);
        return out.toArray();
    }

    // ---------------------------------------------------------------- applications list
    @GetMapping("/api/v1/applications")
    public Map<String, Object> applications(HttpServletRequest request) throws Exception {
        allowBusiness(request);
        allowedKeys(request, "page", "page_size", "q");
        ListInput input = new ListInput(request);
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        String base = "FROM applications a JOIN candidates c ON c.tenant_id=a.tenant_id AND c.id=a.candidate_id JOIN job_versions v ON v.tenant_id=a.tenant_id AND v.id=a.job_version_id JOIN resume_versions r ON r.tenant_id=a.tenant_id AND r.id=a.resume_version_id WHERE a.tenant_id=$1 AND c.retention_until>now() AND (c.name ILIKE $2 OR v.title ILIKE $2)";
        List<Map<String, Object>> items = db.query(
            "SELECT a.*,c.name,v.title,v.version AS job_version,r.version AS resume_version " + base + " ORDER BY a.created_at DESC,a.id LIMIT $3 OFFSET $4",
            auth.tenantId(), "%" + input.q + "%", input.pageSize, input.offset());
        long total = ((Number) db.query("SELECT count(*)::int AS count " + base, auth.tenantId(), "%" + input.q + "%").get(0).get("count")).longValue();
        return listPage(new ArrayList<>(items), total, input);
    }

    // ---------------------------------------------------------------- audit events
    @GetMapping("/api/v1/audit-events")
    public Map<String, Object> auditEvents(HttpServletRequest request) throws Exception {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("ops", "talent_lead").contains(auth.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "需要审计权限");
        allowedKeys(request, "page", "page_size");
        ListInput input = new ListInput(request);
        List<Map<String, Object>> items = db.query(
            "SELECT * FROM (SELECT id,actor_id::text,action,object_id,created_at,NULL::text AS actor_label FROM audit_events WHERE tenant_id=$1 UNION ALL SELECT id,actor AS actor_id,action,object_id,created_at,'外部智能体' AS actor_label FROM agent_audit_events WHERE tenant_id=$1) e ORDER BY created_at DESC,id LIMIT $2 OFFSET $3",
            auth.tenantId(), input.pageSize, input.offset());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("page", input.page);
        out.put("page_size", input.pageSize);
        return out;
    }
}
