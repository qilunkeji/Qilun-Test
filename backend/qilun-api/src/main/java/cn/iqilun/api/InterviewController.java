package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Interview sessions ported from interviews.ts (encrypted transcript, optimistic revision). */
@RestController
public class InterviewController {

    private final Db db;
    private final ApiProperties properties;

    public InterviewController(Db db, ApiProperties properties) {
        this.db = db;
        this.properties = properties;
    }

    private byte[] contactKey() { return InviteAdminController.hexToBytes(properties.getContactKey()); }

    private static void hr(HttpServletRequest request) {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("hr", "talent_lead").contains(auth.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
    }

    private static final String SESSION_JOIN = "FROM interviews i JOIN applications a ON a.id=i.application_id AND a.tenant_id=i.tenant_id JOIN candidates c ON c.id=a.candidate_id AND c.tenant_id=a.tenant_id JOIN job_versions j ON j.id=a.job_version_id AND j.tenant_id=a.tenant_id JOIN resume_versions r ON r.id=a.resume_version_id AND r.tenant_id=a.tenant_id";

    private Map<String, Object> session(String tenant, String id) throws Exception {
        List<Map<String, Object>> rows = db.query(
            "SELECT i.*,a.candidate_id,c.name,j.title,j.tasks,j.criteria,r.text_content,a.job_version_id,a.resume_version_id,j.version AS job_version,r.version AS resume_version " + SESSION_JOIN + " WHERE i.id=$1 AND i.tenant_id=$2 AND c.retention_until>now()",
            id, tenant);
        if (rows.isEmpty()) throw new ApiError(404, "NOT_FOUND", "面试记录不存在或人员资料已到期");
        return rows.get(0);
    }

    @GetMapping("/api/v1/interviews")
    public Map<String, Object> interviews(HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", db.query("SELECT i.id,i.created_at,i.revision,c.name,j.title " + SESSION_JOIN + " WHERE i.tenant_id=$1 AND c.retention_until>now() ORDER BY i.created_at DESC LIMIT 100", a.tenantId()));
        return out;
    }

    @GetMapping("/api/v1/interviews/assessments/{application}")
    public Map<String, Object> interviewAssessments(@PathVariable String application, HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", db.query(
            "SELECT v.id,v.submitted_at,v.package->>'title' AS title FROM assessment_invites v LEFT JOIN assessment_archive_bindings b ON b.tenant_id=v.tenant_id AND b.invite_id=v.id JOIN applications a ON a.candidate_id=coalesce(v.candidate_id,b.candidate_id) AND a.tenant_id=v.tenant_id JOIN candidates c ON c.id=a.candidate_id AND c.tenant_id=a.tenant_id WHERE a.id=$1 AND a.tenant_id=$2 AND c.retention_until>now() AND v.submitted_at IS NOT NULL AND (v.application_id IS NULL OR v.application_id=a.id) ORDER BY v.submitted_at DESC",
            application, a.tenantId()));
        return out;
    }

    @PostMapping("/api/v1/interviews")
    public Map<String, Object> createInterview(@RequestBody(required = false) Map<String, Object> body,
                                               HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        String applicationId = ResumeController.str(body, "application_id");
        String assessmentId = ResumeController.str(body, "assessment_id");
        Object rubricRaw = body == null ? null : body.get("rubric");
        Object questionCount = body == null ? null : body.get("question_count");
        if (applicationId == null || rubricRaw == null || !(questionCount instanceof Number n && (n.intValue() == 10 || n.intValue() == 20)))
            throw ResumeController.invalidInput();
        if (!(rubricRaw instanceof List<?> rubric) || rubric.isEmpty() || rubric.size() > 6)
            throw ResumeController.invalidInput();
        for (Object item : rubric) {
            if (!(item instanceof Map<?, ?> m)) throw ResumeController.invalidInput();
            Object name = m.get("name"), requirement = m.get("requirement"), weight = m.get("weight");
            if (!(name instanceof String s && s.trim().length() >= 2 && s.length() <= 100)
                || !(requirement instanceof String r && r.trim().length() >= 5 && r.length() <= 500)
                || !(weight instanceof Number w && w.intValue() >= 1 && w.intValue() <= 100))
                throw ResumeController.invalidInput();
        }
        long distinctNames = rubric.stream().map(i -> String.valueOf(((Map<?, ?>) i).get("name"))).distinct().count();
        if (distinctNames != rubric.size()) throw ResumeController.invalidInput();
        List<Map<String, Object>> candidates = db.query(
            "SELECT a.candidate_id FROM applications a JOIN candidates c ON c.id=a.candidate_id AND c.tenant_id=a.tenant_id WHERE a.id=$1 AND a.tenant_id=$2 AND c.retention_until>now()",
            applicationId, a.tenantId());
        if (candidates.isEmpty()) throw new ApiError(404, "NOT_FOUND", "岗位申请不存在或人员已到期");
        String candidateId = String.valueOf(candidates.get(0).get("candidate_id"));
        if (assessmentId != null) {
            List<Map<String, Object>> reports = db.query(
                "SELECT v.id FROM assessment_invites v LEFT JOIN assessment_archive_bindings b ON b.tenant_id=v.tenant_id AND b.invite_id=v.id WHERE v.id=$1 AND v.tenant_id=$2 AND coalesce(v.candidate_id,b.candidate_id)=$3 AND v.submitted_at IS NOT NULL AND (v.application_id IS NULL OR v.application_id=$4)",
                assessmentId, a.tenantId(), candidateId, applicationId);
            if (reports.isEmpty()) throw new ApiError(400, "ASSESSMENT_MISMATCH", "测评必须属于同一人员及同一岗位申请，或该人员的独立测评");
        }
        String id = UUID.randomUUID().toString();
        String rubricJson = cn.iqilun.engine.JsJson.stringify(rubricRaw);
        db.tx(tx -> {
            tx.query("INSERT INTO interviews(id,tenant_id,application_id,assessment_id,rubric,question_count,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
                id, a.tenantId(), applicationId, assessmentId, rubricJson, n.intValue(), a.userId());
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), "interview.created", id);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        return out;
    }

    @GetMapping("/api/v1/interviews/{id}")
    public Map<String, Object> interviewDetail(@PathVariable String id, HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        Map<String, Object> s = session(a.tenantId(), id);
        Object transcriptCipher = s.remove("transcript_cipher");
        boolean externalAgent = "external_agent".equals(System.getenv("PROCESSING_MODE"));
        List<Map<String, Object>> runs = db.query(
            "SELECT id,status,feature,result,error_code," + (externalAgent ? "0 AS cost,0 AS reserved_cost" : "cost,reserved_cost") + ",interview_revision,created_at FROM ai_runs WHERE tenant_id=$1 AND interview_id=$2 AND retention_until>now() ORDER BY created_at DESC LIMIT 50",
            a.tenantId(), s.get("id"));
        Map<String, Object> out = new LinkedHashMap<>(s);
        out.put("transcript", transcriptCipher == null ? ""
            : Crypto.decryptContact(String.valueOf(transcriptCipher), contactKey(), "interview:" + a.tenantId() + ":" + s.get("id")));
        out.put("runs", runs);
        return out;
    }

    @PostMapping("/api/v1/interviews/{id}/transcript")
    public Map<String, Object> saveTranscript(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                              HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        Map<String, Object> s = session(a.tenantId(), id);
        String text = ResumeController.str(body, "text");
        Object expectedRevision = body == null ? null : body.get("expected_revision");
        if (text == null || text.trim().length() < 10 || text.length() > 16000
            || !(expectedRevision instanceof Number e && e.longValue() >= 0)
            || body == null || !Boolean.TRUE.equals(body.get("processing_confirmed"))
            || body.keySet().stream().anyMatch(k -> !List.of("text", "expected_revision", "processing_confirmed").contains(k)))
            throw ResumeController.invalidInput();
        List<Map<String, Object>> saved = db.query(
            "UPDATE interviews SET transcript_cipher=$3,revision=revision+1 WHERE id=$1 AND tenant_id=$2 AND revision=$4 RETURNING revision",
            s.get("id"), a.tenantId(), Crypto.encryptContact(text, contactKey(), "interview:" + a.tenantId() + ":" + s.get("id")), e.longValue());
        if (saved.isEmpty()) throw new ApiError(409, "VERSION_CONFLICT", "文稿已被其他人修改，请重新读取后再保存");
        return saved.get(0);
    }
}
