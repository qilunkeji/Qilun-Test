package cn.iqilun.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import cn.iqilun.common.Db;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** ai/meta from apps/api/ai-routes.ts:25 — role gate + mode-dependent static payload. */
@RestController
public class AiMetaController {

    private final Db db;

    public AiMetaController(Db db) { this.db = db; }

    private static boolean externalAgent() { return "external_agent".equals(System.getenv("PROCESSING_MODE")); }
    private static boolean agentConfigured() {
        String v = System.getenv("AGENT_WRITE_TOKEN_SHA256");
        return v != null && v.matches("(?i)^[a-f0-9]{64}$");
    }

    @GetMapping("/api/v1/ai/meta")
    public Map<String, Object> meta(HttpServletRequest request) {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("talent_lead", "hr").contains(auth.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
        boolean externalAgent = "external_agent".equals(System.getenv("PROCESSING_MODE"));
        boolean agentConfigured = System.getenv("AGENT_WRITE_TOKEN_SHA256") != null
            && System.getenv("AGENT_WRITE_TOKEN_SHA256").matches("(?i)^[a-f0-9]{64}$");
        String replyHint = System.getenv("AGENT_REPLY_HINT_TEXT");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", externalAgent ? "external_agent" : "model");
        out.put("processing_label", externalAgent ? "齐论 AI 助手（外部智能体）" : "已配置模型");
        out.put("consent_text", externalAgent ? "交由齐论人才系统接入的 AI 助手（外部智能体）处理" : "发送给已配置的模型供应商进行本次分析");
        out.put("reply_hint", replyHint != null ? replyHint : "通常 1–3 分钟内完成");
        out.put("agent_configured", agentConfigured);
        return out;
    }

    @PostMapping("/api/v1/ai/agent-test")
    public org.springframework.http.ResponseEntity<Map<String, Object>> agentTest(HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("talent_lead").contains(a.role())) throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
        if (!externalAgent()) throw new ApiError(409, "EXTERNAL_AGENT_MODE", "当前未启用外部智能体模式");
        if (!agentConfigured()) throw new ApiError(503, "AGENT_NOT_CONFIGURED", "外部智能体未配置");
        AgentQueue svc = new AgentQueue(db, a.tenantId());
        String nonce = java.util.UUID.randomUUID().toString();
        Map<String, Object> task = svc.createTask("agent_ping", nonce, new LinkedHashMap<>(), a.userId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("task_id", task.get("id"));
        out.put("status", "awaiting_agent");
        return org.springframework.http.ResponseEntity.status(200).body(out);
    }

    @GetMapping("/api/v1/ai/pending")
    public Map<String, Object> pending(HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("talent_lead", "hr").contains(a.role())) throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
        AgentQueue svc = new AgentQueue(db, a.tenantId());
        svc.sweep();
        Map<String, Object> out = new LinkedHashMap<>();
        out.putAll(new AgentMcpController(db).queueStatusFor(a.tenantId()));
        out.put("items", db.query("SELECT id AS task_id,task_type,state,created_at FROM agent_tasks WHERE tenant_id=$1 AND state IN ('queued','claimed') ORDER BY created_at LIMIT 100", a.tenantId()));
        return out;
    }

    @PostMapping("/api/v1/ai/tasks/{id}/cancel")
    public Map<String, Object> cancelTask(@PathVariable String id, HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("talent_lead").contains(a.role())) throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
        return new AgentQueue(db, a.tenantId()).cancel(id);
    }

    @GetMapping("/api/v1/ai/settings")
    public Map<String, Object> settings(HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("talent_lead", "hr").contains(a.role())) throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
        Map<String, Object> featuresMap = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : AgentQueue.FEATURE_TITLES.entrySet()) featuresMap.put(e.getKey(), e.getValue());
        if (externalAgent()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.putAll(new AgentMcpController(db).queueStatusFor(a.tenantId()));
            out.put("features", featuresMap);
            out.put("provider_label", "外部智能体（AI 助手）");
            List<Map<String, Object>> state = db.query("SELECT value FROM agent_state WHERE key=$1", "agent_last_seen:" + a.tenantId());
            Object at = state.isEmpty() ? null : ((Map<?, ?>) state.get(0).get("value")).get("at");
            out.put("last_agent_activity_at", at);
            return out;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("features", featuresMap);
        out.put("configs", db.query("SELECT feature,provider,model,prompt,budget,input_price,output_price,(key_cipher IS NOT NULL) AS has_key,updated_at FROM ai_configs WHERE tenant_id=$1", a.tenantId()));
        out.put("providers", List.of("deepseek", "openai"));
        out.put("currency", "USD");
        out.put("pricing_unit", "每百万token");
        out.put("budget_scope", "累计预算（本地估算），不是供应商账单");
        return out;
    }
}