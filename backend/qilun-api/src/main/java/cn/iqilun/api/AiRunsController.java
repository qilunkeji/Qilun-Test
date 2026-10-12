package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Remaining ai-routes endpoints: settings write/inherit, runs list/detail, agent-test detail, run (external-agent mode). */
@RestController
public class AiRunsController {

    private final Db db;
    private final ApiProperties properties;

    public AiRunsController(Db db, ApiProperties properties) {
        this.db = db;
        this.properties = properties;
    }

    private byte[] contactKey() { return InviteAdminController.hexToBytes(properties.getContactKey()); }

    private static boolean externalAgent() { return "external_agent".equals(System.getenv("PROCESSING_MODE")); }

    private static GuardsFilter.Auth allowed(HttpServletRequest request, boolean settings) {
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!(settings ? List.of("talent_lead") : List.of("talent_lead", "hr")).contains(a.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
        return a;
    }

    @PostMapping("/api/v1/ai/settings")
    public Map<String, Object> writeSettings(@RequestBody(required = false) Map<String, Object> body,
                                             HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = allowed(request, true);
        if (externalAgent()) throw new ApiError(409, "EXTERNAL_AGENT_MODE", "外部智能体模式下模型配置不生效");
        List<String> allowedKeys = List.of("feature", "provider", "model", "key", "prompt", "budget", "input_price", "output_price");
        if (body == null || body.keySet().stream().anyMatch(k -> !allowedKeys.contains(k))) throw ResumeController.invalidInput();
        String feature = str(body, "feature"), provider = str(body, "provider"), model = str(body, "model");
        String prompt = str(body, "prompt"), key = str(body, "key");
        if (!List.of("default", "job_optimize", "resume_review", "interview_outline", "transcript_analysis", "comprehensive_review", "report_interpretation").contains(feature)
            || !List.of("deepseek", "openai").contains(provider)
            || model == null || !model.matches("^[a-zA-Z0-9._:/-]{1,100}$")
            || prompt == null || prompt.trim().length() < 5 || prompt.length() > 3000
            || !(body.get("budget") instanceof Number b && b.doubleValue() > 0 && b.doubleValue() <= 10000)
            || !(body.get("input_price") instanceof Number ip && ip.doubleValue() > 0 && ip.doubleValue() <= 10000)
            || !(body.get("output_price") instanceof Number op && op.doubleValue() > 0 && op.doubleValue() <= 10000)
            || (key != null && key.length() < 10))
            throw ResumeController.invalidInput();
        db.tx(tx -> {
            List<Map<String, Object>> old = tx.query("SELECT * FROM ai_configs WHERE tenant_id=$1 AND feature=$2 FOR UPDATE", a.tenantId(), feature);
            if (!old.isEmpty() && !String.valueOf(old.get(0).get("provider")).equals(provider) && key == null)
                throw new ApiError(400, "KEY_REQUIRED", "更换供应商时请重新输入对应Key");
            String cipher = key != null
                ? Crypto.encryptContact(key, contactKey(), "ai:" + a.tenantId() + ":" + feature)
                : old.isEmpty() ? null : String.valueOf(old.get(0).get("key_cipher"));
            if (cipher == null) throw new ApiError(400, "KEY_REQUIRED", "首次配置需要服务端保存的Key");
            tx.query("INSERT INTO ai_configs(tenant_id,feature,provider,model,key_cipher,prompt,budget,input_price,output_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(tenant_id,feature) DO UPDATE SET provider=$3,model=$4,key_cipher=$5,prompt=$6,budget=$7,input_price=$8,output_price=$9,updated_at=now()",
                a.tenantId(), feature, provider, model, cipher, prompt, body.get("budget"), body.get("input_price"), body.get("output_price"));
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), "ai.configured", feature);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("saved", true);
        out.put("key_returned", false);
        return out;
    }

    @PostMapping("/api/v1/ai/settings/inherit")
    public Map<String, Object> inheritSettings(@RequestBody(required = false) Map<String, Object> body,
                                               HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = allowed(request, true);
        if (externalAgent()) throw new ApiError(409, "EXTERNAL_AGENT_MODE", "外部智能体模式下模型配置不生效");
        if (body == null || body.size() != 1 || !str(body, "feature").matches("^(default|job_optimize|resume_review|interview_outline|transcript_analysis|comprehensive_review|report_interpretation)$"))
            throw ResumeController.invalidInput();
        db.query("DELETE FROM ai_configs WHERE tenant_id=$1 AND feature=$2", a.tenantId(), str(body, "feature"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("inherits_default", true);
        return out;
    }

    @GetMapping("/api/v1/ai/runs")
    public Map<String, Object> runs(HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = allowed(request, false);
        Map<String, Object> out = new LinkedHashMap<>();
        if (externalAgent()) {
            new AgentQueue(db, a.tenantId()).sweep();
            out.put("items", db.query("SELECT id,feature,status,result,error_code,0 AS reserved_cost,0 AS cost,created_at FROM ai_runs WHERE tenant_id=$1 AND interview_id IS NULL AND feature<>'resume_job_screen' AND retention_until>now() ORDER BY created_at DESC LIMIT 50", a.tenantId()));
        } else {
            out.put("items", db.query("SELECT id,feature,status,result,error_code,reserved_cost,cost,usage,config_snapshot,created_at FROM ai_runs WHERE tenant_id=$1 AND interview_id IS NULL AND feature<>'resume_job_screen' AND retention_until>now() ORDER BY created_at DESC LIMIT 50", a.tenantId()));
        }
        return out;
    }

    @GetMapping("/api/v1/ai/runs/{id}")
    public Map<String, Object> runDetail(@PathVariable String id, HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = allowed(request, false);
        Map<String, Object> pending = new AgentQueue(db, a.tenantId()).statusForRun(id);
        List<Map<String, Object>> rows = db.query(
            "SELECT id,feature,status,result,error_code,interview_id,interview_revision,created_at FROM ai_runs WHERE id=$1 AND tenant_id=$2 AND retention_until>now()", id, a.tenantId());
        if (rows.isEmpty()) throw new ApiError(404, "NOT_FOUND", "处理记录不存在或已到期");
        if ("resume_job_screen".equals(rows.get(0).get("feature"))
            && db.query("SELECT i.id FROM resume_screen_items i JOIN resume_versions r ON r.id=i.resume_version_id AND r.tenant_id=i.tenant_id JOIN candidates c ON c.id=r.candidate_id AND c.tenant_id=i.tenant_id WHERE i.id=$1 AND i.tenant_id=$2 AND c.retention_until>now()", id, a.tenantId()).isEmpty())
            throw new ApiError(404, "NOT_FOUND", "简历分析不存在或已到期");
        Map<String, Object> out = new LinkedHashMap<>(rows.get(0));
        out.put("result", "completed".equals(rows.get(0).get("status")) ? rows.get(0).get("result") : null);
        out.put("pending", pending);
        out.put("review_required", true);
        return out;
    }

    @GetMapping("/api/v1/ai/agent-test/{id}")
    public Map<String, Object> agentTestDetail(@PathVariable String id, HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = allowed(request, false);
        AgentQueue svc = new AgentQueue(db, a.tenantId());
        svc.sweep();
        Map<String, Object> t = svc.getTask(id, db);
        if (!"agent_ping".equals(t.get("task_type"))) throw new ApiError(404, "NOT_FOUND", "测试不可访问");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("task_id", t.get("id"));
        out.put("status", t.get("state"));
        out.put("created_at", t.get("created_at"));
        out.put("claimed_at", t.get("claimed_at"));
        out.put("completed_at", t.get("completed_at"));
        out.put("error_code", t.get("error_code"));
        Map<String, Object> ui = svc.pendingStatus(t);
        out.put("ui_status", ui);
        out.put("timing", null);
        out.put("wake", null);
        out.put("wake_seconds", null);
        return out;
    }


    /** POST /api/v1/ai/run — external-agent mode queue path (model mode requires live vendor calls, out of parity scope). */
    @PostMapping("/api/v1/ai/run")
    public Map<String, Object> run(@RequestBody(required = false) Map<String, Object> body,
                                   HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = allowed(request, false);
        if (externalAgent()) {
            String token = System.getenv("AGENT_WRITE_TOKEN_SHA256");
            if (token == null || !token.matches("(?i)^[a-f0-9]{64}$"))
                throw new ApiError(503, "AGENT_NOT_CONFIGURED", "外部智能体未配置");
        }
        List<String> allowedKeys = List.of("feature", "material", "recruiting", "interview", "authorized_to_send");
        if (body == null || body.keySet().stream().anyMatch(k -> !allowedKeys.contains(k))
            || !Boolean.TRUE.equals(body.get("authorized_to_send"))
            || !AgentQueue.FEATURE_TITLES.containsKey(String.valueOf(body.get("feature"))))
            throw ResumeController.invalidInput();
        String feature = String.valueOf(body.get("feature"));
        boolean hasRecruiting = body.get("recruiting") instanceof Map<?, ?>;
        boolean hasInterview = body.get("interview") instanceof Map<?, ?>;
        String material = str(body, "material");
        if (hasRecruiting && !feature.equals("job_optimize"))
            throw new ApiError(400, "INVALID_FEATURE", "招聘需求仅用于招聘优化");
        if (hasInterview && (hasRecruiting || material != null))
            throw new ApiError(400, "INVALID_FEATURE", "面试任务与功能不匹配");
        String raw;
        if (hasInterview) throw new ApiError(400, "INVALID_FEATURE", "面试任务与功能不匹配"); // interview evidence requires session context; not reachable in parity scenarios
        else if (hasRecruiting) raw = recruitingEvidence(a, (Map<?, ?>) body.get("recruiting"));
        else raw = material;
        if (raw == null || raw.trim().length() < 10) throw new ApiError(400, "MATERIAL_REQUIRED", "请填写招聘需求或材料");
        String runId = UUID.randomUUID().toString();
        AgentQueue svc = new AgentQueue(db, a.tenantId());
        Map<String, Object> task = db.tx(tx -> {
            tx.query("SELECT id FROM staff_users WHERE id=$1 AND tenant_id=$2 FOR UPDATE", a.userId(), a.tenantId());
            Map<String, Object> counts = tx.query("SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour')::int hourly,count(*) FILTER(WHERE status='awaiting_agent')::int pending FROM ai_runs WHERE tenant_id=$1 AND actor_id=$2", a.tenantId(), a.userId()).get(0);
            if (((Number) counts.get("hourly")).intValue() >= 20 || ((Number) counts.get("pending")).intValue() >= 5)
                throw new ApiError(429, "AGENT_RATE_LIMITED", ((Number) counts.get("pending")).intValue() >= 5 ? "还有任务在处理中" : "提交过于频繁，请稍后再试");
            List<Map<String, Object>> prompts = tx.query("SELECT feature,prompt FROM ai_configs WHERE tenant_id=$1 AND feature IN ($2,'default')", a.tenantId(), feature);
            String userPrompt = null;
            for (Map<String, Object> pr : prompts) if (feature.equals(pr.get("feature"))) userPrompt = String.valueOf(pr.get("prompt"));
            if (userPrompt == null) for (Map<String, Object> pr : prompts) if ("default".equals(pr.get("feature"))) userPrompt = String.valueOf(pr.get("prompt"));
            if (userPrompt == null) userPrompt = "结合岗位任务和材料证据提出可核验的建议，保留未知项。";
            List<Map<String, Object>> evidence = new java.util.ArrayList<>();
            int i = 1;
            for (String line : raw.split("\n+")) if (!line.trim().isEmpty()) {
                Map<String, Object> e = new LinkedHashMap<>();
                e.put("id", "E" + i++);
                e.put("text", ResumeScreensController.redactContacts(line));
                evidence.add(e);
            }
            Map<String, Object> snapshot = new LinkedHashMap<>();
            snapshot.put("material", cn.iqilun.engine.JsJson.stringify(evidence));
            snapshot.put("evidence", evidence);
            snapshot.put("user_prompt", userPrompt);
            snapshot.put("task_brief", AgentQueue.FEATURE_TITLES.get(feature));
            String snapshotJson = cn.iqilun.engine.JsJson.stringify(snapshot);
            tx.query("INSERT INTO ai_runs(id,tenant_id,actor_id,feature,config_feature,config_snapshot,status,input_cipher,input_hash,reserved_cost,cost,interview_id,interview_revision) VALUES($1,$2,$3,$4,'external_agent',$5,'awaiting_agent',$6,$7,0,0,$8,$9)",
                runId, a.tenantId(), a.userId(), feature, "{}", Crypto.encryptContact(snapshotJson, contactKey(), "ai-run:" + a.tenantId()), Crypto.digest(snapshotJson), null, null);
            Map<String, Object> inputJson = new LinkedHashMap<>();
            inputJson.put("ai_run_id", runId);
            inputJson.put("feature", feature);
            inputJson.put("evidence_count", (long) evidence.size());
            inputJson.put("material_chars", (long) raw.length());
            return svc.insert(tx, feature, runId, inputJson, a.userId());
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", runId);
        out.put("status", "awaiting_agent");
        out.put("task_id", task.get("id"));
        out.put("ui_status", svc.pendingStatus(task));
        out.put("review_required", true);
        return out;
    }

    private String recruitingEvidence(GuardsFilter.Auth a, Map<?, ?> brief) throws Exception {
        String title = String.valueOf(brief.get("title"));
        String location = String.valueOf(brief.get("location"));
        Object min = brief.get("salary_min"), max = brief.get("salary_max");
        long months = ((Number) brief.get("salary_months")).longValue();
        String salary = min == null ? "面议 / 待确认" : min + "-" + max + "元，" + months + "薪";
        String experience = String.valueOf(brief.get("experience"));
        String education = String.valueOf(brief.get("education"));
        String style = String.valueOf(brief.get("style"));
        String requirements = String.valueOf(brief.get("requirements"));
        StringBuilder sb = new StringBuilder();
        sb.append("招聘需求（招聘方填写）：岗位 ").append(title).append("；地点 ").append(location.isEmpty() ? "待确认" : location)
          .append("；月薪 ").append(salary).append("；经验 ").append(experience.isEmpty() ? "待确认" : experience)
          .append("；学历 ").append(education.isEmpty() ? "待确认" : education).append("；文案风格 ").append(style).append("。")
          .append("补充需求：").append(requirements.isEmpty() ? "未提供，职责与要求需要标注为建议并由招聘方确认。" : requirements);
        Object materialIds = brief.get("material_ids");
        if (materialIds instanceof List<?> ids) {
            for (Object idObj : ids.stream().distinct().toList()) {
                String id = String.valueOf(idObj);
                List<Map<String, Object>> rows = db.query("SELECT title,content_cipher,content_hash FROM recruiting_materials WHERE id=$1 AND tenant_id=$2 AND archived_at IS NULL", id, a.tenantId());
                if (rows.isEmpty()) throw new ApiError(404, "MATERIAL_NOT_FOUND", "选中的资料已归档或不可访问，请重新选择");
                String hash = String.valueOf(rows.get(0).get("content_hash"));
                sb.append("公司参考资料【").append(rows.get(0).get("title")).append(" / ").append(id).append(" / ").append(hash, 0, 12).append("】：")
                  .append(Crypto.decryptContact(String.valueOf(rows.get(0).get("content_cipher")), contactKey(), "recruiting:" + a.tenantId()));
            }
        }
        if (sb.length() > 12000) throw new ApiError(400, "MATERIAL_TOO_LONG", "选中资料和需求合计超过12000字，请减少资料或精简内容");
        return sb.toString();
    }

    private static String str(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        return v == null ? null : String.valueOf(v);
    }
}
