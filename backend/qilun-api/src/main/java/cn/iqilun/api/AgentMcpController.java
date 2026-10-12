package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * MCP agent endpoint + ai agent-test/cancel/pending ported from agent-tasks/mcp.ts
 * and the agent portions of ai-routes.ts. Bearer auth via AGENT_WRITE_TOKEN_SHA256,
 * loopback source only (agent-auth.ts semantics).
 */
@RestController
public class AgentMcpController {

    private static final List<String> MACHINE_TOOLS = List.of(
        "get_queue_status", "list_task_types", "list_tasks", "wait_for_tasks", "claim_task",
        "get_task_context", "renew_lease", "submit_task_result", "fail_task", "get_task");

    private final Db db;

    public AgentMcpController(Db db) {
        this.db = db;
    }

    private static void agentAuth(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        boolean loopback = "127.0.0.1".equals(remote) || "0:0:0:0:0:0:0:1".equals(remote) || "::1".equals(remote);
        if (!loopback) throw new ApiError(403, "LOCAL_ADMIN_ONLY", "请通过受信任网关访问");
        String header = request.getHeader("Authorization");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^Bearer ([A-Za-z0-9_-]{32,256})$").matcher(header == null ? "" : header);
        if (!m.matches()) throw new ApiError(401, "AUTH_REQUIRED", "需要智能体专用凭证");
        String expected = System.getenv("AGENT_WRITE_TOKEN_SHA256");
        if (expected == null || !expected.matches("(?i)^[a-f0-9]{64}$"))
            throw new ApiError(503, "AGENT_NOT_CONFIGURED", "外部智能体未配置");
        if (!Crypto.digest(m.group(1)).equals(expected.toLowerCase()))
            throw new ApiError(401, "AUTH_REQUIRED", "智能体凭证无效");
    }

    private AgentQueue queue(String tenant) { return new AgentQueue(db, tenant); }

    @PostMapping("/mcp/agent")
    public org.springframework.http.ResponseEntity<Map<String, Object>> mcp(@RequestBody(required = false) Map<String, Object> body,
                                                                            HttpServletRequest request) throws Exception {
        agentAuth(request);
        // default tenant scope for the single-tenant parity deployment
        List<Map<String, Object>> tenants = db.query("SELECT id FROM tenants ORDER BY created_at LIMIT 1");
        String tenant = String.valueOf(tenants.get(0).get("id"));
        AgentQueue svc = queue(tenant);
        String method = String.valueOf(body.get("method"));
        Object id = body.get("id");
        Map<String, Object> params = body.get("params") instanceof Map<?, ?> p ? cast(p) : new LinkedHashMap<>();

        db.query("INSERT INTO agent_state(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=now()",
            "agent_last_seen:" + tenant, "{\"at\":\"" + java.time.Instant.now() + "\"}");
        if (List.of("initialize", "notifications/initialized", "ping", "tools/list").contains(method))
            svc.audit(db, "agent.protocol." + method.replaceAll("[^a-z_]", "_"), "-", "协议调用");

        Map<String, Object> result = new LinkedHashMap<>();
        switch (method) {
            case "initialize" -> {
                result.put("protocolVersion", "2024-11-05");
                result.put("capabilities", Map.of("tools", Map.of("listChanged", false)));
                Map<String, Object> serverInfo = new LinkedHashMap<>();
                serverInfo.put("name", "qilun-talent-agent");
                serverInfo.put("version", "1.0.0");
                result.put("serverInfo", serverInfo);
            }
            case "ping" -> { }
            case "tools/list" -> {
                List<Object> tools = new ArrayList<>();
                for (String name : MACHINE_TOOLS) {
                    Map<String, Object> tool = new LinkedHashMap<>();
                    tool.put("name", name);
                    tool.put("description", "齐论人才系统通用工具：" + name);
                    tool.put("inputSchema", AgentSchemas.toolSchema(name));
                    tools.add(tool);
                }
                result.put("tools", tools);
                result.put("_meta", Map.of("task_types", typeList()));
            }
            case "tools/call" -> {
                String name = String.valueOf(params.get("name"));
                @SuppressWarnings("unchecked")
                Map<String, Object> args = params.get("arguments") instanceof Map<?, ?> a ? (Map<String, Object>) a : new LinkedHashMap<>();
                svc.audit(db, "agent." + name, args.get("task_id") instanceof String s ? s : "-", "通用工具调用");
                Object toolResult = callTool(svc, name, args);
                Map<String, Object> content = new LinkedHashMap<>();
                content.put("type", "text");
                content.put("text", cn.iqilun.engine.JsJson.stringify(toolResult));
                result.put("content", List.of(content));
            }
            default -> {
                Map<String, Object> rpcError = new LinkedHashMap<>();
                rpcError.put("jsonrpc", "2.0");
                rpcError.put("id", id == null ? null : id);
                rpcError.put("error", Map.of("code", -32601, "message", "Method not found"));
                return org.springframework.http.ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(rpcError);
            }
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jsonrpc", "2.0");
        response.put("id", id == null ? null : id);
        response.put("result", result);
        return org.springframework.http.ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    private Object callTool(AgentQueue svc, String name, Map<String, Object> args) throws Exception {
        return switch (name) {
            case "get_queue_status" -> queueStatus();
            case "list_task_types" -> Map.of("types", typeList());
            case "list_tasks" -> Map.of();
            case "claim_task" -> svc.claim(str(args.get("task_id")), strList(args.get("types")),
                intOrNull(args.get("lease_minutes")), strOr(args.get("request_id"), UUID.randomUUID().toString()));
            case "submit_task_result" -> svc.submit(str(args.get("task_id")), str(args.get("lease_token")),
                str(args.get("request_id")), args.get("result"), Boolean.TRUE.equals(args.get("validate_only")));
            case "get_task_context" -> {
                svc.sweep();
                Map<String, Object> task = svc.getTask(str(args.get("task_id")), db);
                svc.verifyLease(task, str(args.get("lease_token")));
                yield svc.buildContext(task);
            }
            case "renew_lease" -> {
                Map<String, Object> task = svc.getTask(str(args.get("task_id")), db);
                svc.verifyLease(task, str(args.get("lease_token")));
                int minutes = args.get("lease_minutes") instanceof Number mn ? mn.intValue() : 20;
                yield db.query("UPDATE agent_tasks SET lease_until=now()+$2*interval '1 minute',updated_at=now() WHERE id=$1 RETURNING lease_until",
                    task.get("id"), (long) minutes).get(0);
            }
            case "wait_for_tasks" -> {
                long deadline = System.currentTimeMillis() + (args.get("timeout_seconds") instanceof Number tn ? tn.longValue() : 25) * 1000;
                Map<String, Object> result2 = null;
                while (System.currentTimeMillis() < deadline) {
                    svc.sweep();
                    List<Map<String, Object>> queued = db.query(
                        "SELECT id,task_type FROM agent_tasks WHERE tenant_id=$1 AND state='queued' ORDER BY priority DESC,created_at LIMIT 5", System.getenv("DEFAULT_TENANT_ID"));
                    if (!queued.isEmpty()) {
                        Map<String, Object> out2 = new LinkedHashMap<>();
                        List<Object> qlist = new ArrayList<>();
                        for (Map<String, Object> q : queued) {
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("task_id", q.get("id"));
                            row.put("task_type", q.get("task_type"));
                            qlist.add(row);
                        }
                        out2.put("queued", qlist);
                        result2 = out2;
                        break;
                    }
                    Thread.sleep(Math.min(1000, Math.max(1, deadline - System.currentTimeMillis())));
                }
                if (result2 == null) { result2 = new LinkedHashMap<>(); result2.put("queued", new ArrayList<>()); }
                yield result2;
            }
            case "fail_task" -> svc.fail(str(args.get("task_id")), str(args.get("lease_token")),
                str(args.get("error_code")), Boolean.TRUE.equals(args.get("retry")), strOr(args.get("request_id"), UUID.randomUUID().toString()));
            case "get_task" -> {
                svc.sweep();
                Map<String, Object> t = svc.getTask(str(args.get("task_id")), db);
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("task_id", t.get("id"));
                out.put("task_type", t.get("task_type"));
                out.put("state", t.get("state"));
                out.put("attempts", t.get("attempts"));
                out.put("error_code", t.get("error_code"));
                out.put("completed_at", t.get("completed_at"));
                out.put("result_summary", t.get("result_summary"));
                yield out;
            }
            default -> throw new ApiError(403, "TOOL_NOT_ALLOWED_FOR_TASK", "未提供此上下文工具");
        };
    }

    public Map<String, Object> queueStatus() throws Exception {
        List<Map<String, Object>> tenants = db.query("SELECT id FROM tenants ORDER BY created_at LIMIT 1");
        return queueStatusFor(String.valueOf(tenants.get(0).get("id")));
    }

    public Map<String, Object> queueStatusFor(String tenant) throws Exception {
        AgentQueue svc = queue(tenant);
        svc.sweep();
        List<Map<String, Object>> rows = db.query("SELECT task_type,state,count(*)::int AS count FROM agent_tasks WHERE tenant_id=$1 GROUP BY task_type,state", tenant);
        Map<String, Object> summary = db.query("SELECT coalesce(max(EXTRACT(epoch FROM now()-created_at)) FILTER(WHERE state='queued'),0)::int AS oldest_queued_seconds,count(*) FILTER(WHERE state IN ('queued','claimed') AND created_at<now()-$2*interval '1 minute')::int AS stale_count,count(*) FILTER(WHERE state IN ('queued','claimed'))::int AS pending_count FROM agent_tasks WHERE tenant_id=$1",
            tenant, 10L).get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", "external_agent".equals(System.getenv("PROCESSING_MODE")) ? "external_agent" : "model");
        String token = System.getenv("AGENT_WRITE_TOKEN_SHA256");
        out.put("agent_configured", token != null && token.matches("(?i)^[a-f0-9]{64}$"));
        out.put("queue", rows);
        out.putAll(summary);
        out.put("wake", wakeStatus(tenant));
        out.put("now", java.time.Instant.now().toString());
        return out;
    }

    /** wake.status port — AGENT_WAKE_WEBHOOK_URL unset in the parity deployment. */
    private Map<String, Object> wakeStatus(String tenant) throws Exception {
        List<Map<String, Object>> logs = db.query(
            "SELECT l.status,l.http_status,l.created_at,l.completed_at FROM agent_wake_log l JOIN agent_tasks t ON t.id=l.task_id WHERE t.tenant_id=$1 AND l.created_at>now()-interval '24 hours' ORDER BY l.created_at DESC", tenant);
        Map<String, Object> sent = null, failed = null;
        List<Object> attempted = new ArrayList<>();
        for (Map<String, Object> l : logs) {
            if ("sent".equals(l.get("status")) && sent == null) sent = l;
            if ("failed".equals(l.get("status")) && failed == null) failed = l;
            if (List.of("sent", "failed").contains(String.valueOf(l.get("status")))) attempted.add(l);
        }
        String url = System.getenv("AGENT_WAKE_WEBHOOK_URL");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("configured", url != null && !url.isBlank());
        out.put("host", null);
        out.put("last_success_at", sent == null ? null : sent.get("completed_at"));
        out.put("last_failure_at", failed == null ? null : failed.get("created_at"));
        out.put("last_failure_status", failed == null ? null : failed.get("http_status"));
        out.put("success_rate_24h", attempted.isEmpty() ? null : (Object) (long) Math.round(attempted.stream().filter(l -> "sent".equals(String.valueOf(((Map<?, ?>) l).get("status")))).count() * 100.0 / attempted.size()));
        out.put("label", url != null && !url.isBlank() ? "已配置唤醒；是否连接成功以测试结果为准" : "未配置，依赖智能体巡检");
        return out;
    }

    static List<Map<String, Object>> typeList() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AgentQueue.TaskType def : AgentQueue.allTypes()) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("type", def.type);
            d.put("version", def.version);
            d.put("title", def.title);
            d.put("description", def.description());
            d.put("priority", (long) def.priority);
            d.put("default_lease_minutes", (long) def.defaultLeaseMinutes);
            d.put("rules_text", def.rulesText());
            d.put("output_json_schema", AgentSchemas.outputSchema(def.type));
            d.put("context_tools", new ArrayList<>());
            d.put("validation_codes", def.ping
                ? List.of("INVALID_OUTPUT", "NONCE_MISMATCH")
                : List.of("INVALID_OUTPUT", "UNVERIFIABLE_CITATION", "UNVERIFIABLE_INTERVIEW_CITATION", "RUBRIC_MISMATCH", "SCORE_WITHOUT_EVIDENCE", "SUBJECT_CHANGED"));
            out.add(d);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> cast(Map<?, ?> p) { return (Map<String, Object>) p; }
    private static String str(Object v) { return v == null ? null : String.valueOf(v); }
    private static String strOr(Object v, String dflt) { return v == null ? dflt : String.valueOf(v); }
    private static Integer intOrNull(Object v) { return v instanceof Number n ? n.intValue() : null; }
    @SuppressWarnings("unchecked")
    private static List<String> strList(Object v) { return v instanceof List<?> l ? (List<String>) l : null; }
}
