package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Resume chain ported from resume-import.ts (importResume), resume-library.ts
 * (extension grants, resume-library list/delete, /extension/v1/imports).
 */
@RestController
public class ResumeController {

    private final Db db;
    private final ApiProperties properties;

    public ResumeController(Db db, ApiProperties properties) {
        this.db = db;
        this.properties = properties;
    }

    private byte[] contactKey() { return InviteAdminController.hexToBytes(properties.getContactKey()); }

    private static void hr(HttpServletRequest request) {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("hr", "talent_lead").contains(auth.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "需要招聘业务权限");
    }

    // ------------------------------------------------------------------ import core
    static final class ImportInput {
        String candidateId, name, contact, purpose, processingBasis, retentionUntil, channel, externalId, authorizationRef, filename, textContent, completeness;
    }

    static ImportInput parseImport(Map<String, Object> body, boolean extensionMode) {
        ImportInput out = new ImportInput();
        out.candidateId = extensionMode ? null : str(body, "candidate_id");
        out.name = str(body, "name");
        out.contact = extensionMode ? null : str(body, "contact");
        out.purpose = str(body, "purpose");
        out.processingBasis = str(body, "processing_basis");
        out.retentionUntil = str(body, "retention_until");
        out.channel = str(body, "channel");
        out.externalId = str(body, "external_id");
        out.authorizationRef = str(body, "authorization_ref");
        out.filename = str(body, "filename");
        out.textContent = str(body, "text_content");
        out.completeness = str(body, "completeness");
        List<String> allowed = extensionMode
            ? List.of("name", "purpose", "processing_basis", "retention_until", "channel", "external_id", "authorization_ref", "filename", "text_content", "completeness")
            : List.of("candidate_id", "name", "contact", "purpose", "processing_basis", "retention_until", "channel", "external_id", "authorization_ref", "filename", "text_content", "completeness");
        for (String key : body.keySet()) if (!allowed.contains(key)) throw invalidInput();
        if (out.name == null || out.name.isBlank() || out.purpose == null || !List.of("recruitment", "talent_pool").contains(out.purpose)
            || out.processingBasis == null || out.processingBasis.isBlank() || out.channel == null || out.channel.isBlank()
            || out.externalId == null || out.externalId.isBlank() || out.filename == null || !out.filename.toLowerCase().endsWith(".txt")
            || out.textContent == null || out.textContent.isEmpty() || out.textContent.trim().isEmpty() || out.textContent.length() > 200000
            || out.textContent.split("\n", -1).length > 5000 || out.textContent.indexOf('\0') >= 0
            || out.completeness == null || !List.of("full", "summary_only").contains(out.completeness)
            || out.retentionUntil == null)
            throw invalidInput();
        try {
            if (Instant.parse(out.retentionUntil).toEpochMilli() <= System.currentTimeMillis()) throw invalidInput();
        } catch (Exception e) {
            if (e instanceof ApiError) throw e;
            throw invalidInput();
        }
        return out;
    }

    static ApiError invalidInput() { return new ApiError(400, "INVALID_INPUT", "输入格式不正确"); }
    static ApiError notFound() { return new ApiError(404, "NOT_FOUND", "记录不存在或不在授权范围内"); }
    static ApiError versionConflict(String message) { return new ApiError(409, "VERSION_CONFLICT", message); }

    Map<String, Object> importResume(ImportInput input, String tenantId, String userId) throws Exception {
        String hash = Crypto.digest(input.textContent);
        return db.tx(tx -> {
            List<Map<String, Object>> sources = tx.query(
                "SELECT id,candidate_id FROM candidate_sources WHERE tenant_id=$1 AND channel=$2 AND external_id=$3",
                tenantId, input.channel, input.externalId);
            Map<String, Object> source = sources.isEmpty() ? null : sources.get(0);
            if (source != null && input.candidateId != null && !String.valueOf(source.get("candidate_id")).equals(input.candidateId))
                throw versionConflict("此来源已绑定其他人员，需人工核验");
            String candidateId = source != null ? String.valueOf(source.get("candidate_id"))
                : input.candidateId != null ? input.candidateId : UUID.randomUUID().toString();
            if (source != null || input.candidateId != null) {
                List<Map<String, Object>> candidates = tx.query(
                    "SELECT id,name,purpose FROM candidates WHERE tenant_id=$1 AND id=$2 AND retention_until>now() FOR UPDATE",
                    tenantId, candidateId);
                if (candidates.isEmpty()) throw notFound();
                Map<String, Object> c = candidates.get(0);
                if (!String.valueOf(c.get("name")).equals(input.name) || !String.valueOf(c.get("purpose")).equals(input.purpose))
                    throw versionConflict("来源绑定的姓名或用途与主档不一致，请核验，不自动覆盖");
            } else {
                tx.query("INSERT INTO candidates(id,tenant_id,name,contact_cipher,purpose,processing_basis,retention_until,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
                    candidateId, tenantId, input.name,
                    input.contact == null ? null : Crypto.encryptContact(input.contact, contactKey(), tenantId),
                    input.purpose, input.processingBasis, input.retentionUntil, userId);
            }
            String sourceId = source != null ? String.valueOf(source.get("id")) : UUID.randomUUID().toString();
            if (source == null)
                tx.query("INSERT INTO candidate_sources(id,tenant_id,candidate_id,channel,external_id,authorization_ref) VALUES($1,$2,$3,$4,$5,$6)",
                    sourceId, tenantId, candidateId, input.channel, input.externalId, input.authorizationRef);
            List<Map<String, Object>> duplicates = tx.query(
                "SELECT id,version FROM resume_versions WHERE tenant_id=$1 AND source_id=$2 AND content_hash=$3",
                tenantId, sourceId, hash);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("candidate_id", candidateId);
            if (!duplicates.isEmpty()) {
                out.put("resume_version_id", duplicates.get(0).get("id"));
                out.put("version", duplicates.get(0).get("version"));
                out.put("duplicate", true);
                return out;
            }
            long version = ((Number) tx.query("SELECT coalesce(max(version),0)::int+1 AS version FROM resume_versions WHERE tenant_id=$1 AND candidate_id=$2",
                tenantId, candidateId).get(0).get("version")).longValue();
            String resumeId = UUID.randomUUID().toString();
            tx.query("INSERT INTO resume_versions(id,tenant_id,candidate_id,source_id,version,filename,content_hash,text_content,completeness,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                resumeId, tenantId, candidateId, sourceId, version, input.filename, hash, input.textContent, input.completeness, userId);
            List<String> lines = jsSplitRegex(input.textContent);
            for (int n = 0; n < lines.size(); n++)
                tx.query("INSERT INTO document_chunks(id,tenant_id,resume_version_id,line_number,text_content) VALUES($1,$2,$3,$4,$5)",
                    UUID.randomUUID().toString(), tenantId, resumeId, (long) (n + 1), lines.get(n));
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), tenantId, userId, "resume.imported", resumeId);
            out.put("resume_version_id", resumeId);
            out.put("version", version);
            out.put("duplicate", false);
            return out;
        });
    }

    // ------------------------------------------------------------------ web import
    @PostMapping("/api/v1/talents/imports")
    public ResponseEntity<Map<String, Object>> importWeb(@RequestBody(required = false) Map<String, Object> body,
                                                         HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = BusinessController.authBusinessPublic(request);
        Map<String, Object> result = importResume(parseImport(body, false), a.tenantId(), a.userId());
        return ResponseEntity.status(Boolean.TRUE.equals(result.get("duplicate")) ? 200 : 201).body(result);
    }

    // ------------------------------------------------------------------ extension grants
    @PostMapping("/api/v1/resume-extension/grants")
    public ResponseEntity<Map<String, Object>> createGrant(@RequestBody(required = false) Map<String, Object> body,
                                                           HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = auth(request);
        String extensionId = str(body, "extension_id");
        if (extensionId == null || !extensionId.matches("^[a-p]{32}$") || body.size() != 1) throw invalidInput();
        String token = "cr_" + Crypto.randomToken();
        String id = UUID.randomUUID().toString();
        db.query("INSERT INTO resume_extension_grants(id,tenant_id,user_id,token_hash,extension_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')",
            id, a.tenantId(), a.userId(), Crypto.digest(token), extensionId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("token", token);
        out.put("expires_in_seconds", 3600L);
        out.put("scope", "resume:import");
        out.put("display_once", true);
        return ResponseEntity.status(201).body(out);
    }

    @GetMapping("/api/v1/resume-extension/grants")
    public Map<String, Object> listGrants(HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = auth(request);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", db.query("SELECT id,extension_id,expires_at,revoked_at,created_at FROM resume_extension_grants WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 50",
            a.tenantId(), a.userId()));
        return out;
    }

    @PostMapping("/api/v1/resume-extension/grants/{id}/revoke")
    public Map<String, Object> revokeGrant(@PathVariable String id, HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = auth(request);
        List<Map<String, Object>> rows = db.query("UPDATE resume_extension_grants SET revoked_at=now() WHERE id=$1 AND tenant_id=$2 AND user_id=$3 RETURNING id",
            id, a.tenantId(), a.userId());
        if (rows.isEmpty()) throw notFound();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("revoked", true);
        return out;
    }

    // ------------------------------------------------------------------ resume library list/delete
    @GetMapping("/api/v1/resume-library")
    public Map<String, Object> library(HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = auth(request);
        for (String key : request.getParameterMap().keySet())
            if (!List.of("page", "page_size", "q", "group", "channel").contains(key))
                throw new ApiError(400, "INVALID_QUERY", "查询条件无效");
        BusinessController.ListInput input = new BusinessController.ListInput(request);
        String group = request.getParameter("group");
        String channel = request.getParameter("channel");
        String base = "FROM resume_versions r JOIN candidates c ON c.tenant_id=r.tenant_id AND c.id=r.candidate_id JOIN candidate_sources s ON s.tenant_id=r.tenant_id AND s.id=r.source_id WHERE r.tenant_id=$1 AND c.retention_until>now() AND (c.name ILIKE $2 OR r.text_content ILIKE $2) AND ($3::uuid IS NULL OR c.project_group_id=$3) AND ($4::text IS NULL OR s.channel=$4)";
        List<Map<String, Object>> items = db.query(
            "SELECT r.id,r.candidate_id,r.version,r.filename,r.completeness,r.created_at,c.name,c.project_group_id,c.purpose,c.retention_until,s.channel,s.external_id " + base + " ORDER BY r.created_at DESC,r.id LIMIT $5 OFFSET $6",
            a.tenantId(), "%" + input.q + "%", group, channel, input.pageSize, input.offset());
        long total = ((Number) db.query("SELECT count(*)::int n " + base, a.tenantId(), "%" + input.q + "%", group, channel).get(0).get("n")).longValue();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", input.page);
        out.put("page_size", input.pageSize);
        return out;
    }

    @PostMapping("/api/v1/resume-library/{id}/delete")
    public Map<String, Object> deleteResume(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                            HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = auth(request);
        if (body == null || !"delete_resume".equals(body.get("confirm"))) throw invalidInput();
        db.tx(tx -> {
            List<Map<String, Object>> rows = tx.query("SELECT id FROM resume_versions WHERE id=$1 AND tenant_id=$2 FOR UPDATE", id, a.tenantId());
            if (rows.isEmpty()) throw notFound();
            if (!tx.query("SELECT id FROM applications WHERE resume_version_id=$1 AND tenant_id=$2", id, a.tenantId()).isEmpty())
                throw new ApiError(409, "RESUME_IN_USE", "该版本被招聘申请引用，不能在简历库直接删除；请由负责人处理关联记录");
            List<Map<String, Object>> items = tx.query("SELECT id FROM resume_screen_items WHERE resume_version_id=$1 AND tenant_id=$2", id, a.tenantId());
            for (Map<String, Object> item : items) {
                String itemId = String.valueOf(item.get("id"));
                tx.query("UPDATE agent_tasks SET state='cancelled',lease_token_hash=NULL,lease_until=NULL,completed_at=now() WHERE subject_id=$1 AND tenant_id=$2 AND state IN ('queued','claimed')", itemId, a.tenantId());
                tx.query("DELETE FROM resume_screen_reviews WHERE item_id=$1 AND tenant_id=$2", itemId, a.tenantId());
                tx.query("DELETE FROM resume_screen_items WHERE id=$1 AND tenant_id=$2", itemId, a.tenantId());
                tx.query("UPDATE ai_runs SET status='cancelled',input_cipher='',result=NULL,error_code='RESUME_DELETED' WHERE id=$1 AND tenant_id=$2", itemId, a.tenantId());
            }
            tx.query("DELETE FROM document_chunks WHERE resume_version_id=$1 AND tenant_id=$2", id, a.tenantId());
            tx.query("DELETE FROM resume_versions WHERE id=$1 AND tenant_id=$2", id, a.tenantId());
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,'resume.deleted',$4)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), id);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", true);
        out.put("scope", "该简历版本、文本行及关联筛选材料；主档、其他版本、备份和下载文件不在本次删除范围");
        return out;
    }

    // ------------------------------------------------------------------ extension boundary (/extension/v1)
    @PostMapping("/extension/v1/imports")
    public ResponseEntity<Map<String, Object>> extensionImports(@RequestBody(required = false) Map<String, Object> body,
                                                                HttpServletRequest request, HttpServletResponse response) throws Exception {
        String origin = request.getHeader("Origin") == null ? "" : request.getHeader("Origin");
        java.util.regex.Matcher matcher = Pattern.compile("^chrome-extension://([a-p]{32})$").matcher(origin);
        if (!matcher.matches()) throw new ApiError(403, "ORIGIN_REJECTED", "仅允许已登记浏览器扩展");
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
        response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
        String authHeader = request.getHeader("Authorization");
        java.util.regex.Matcher tokenMatcher = Pattern.compile("^Bearer (cr_[A-Za-z0-9_-]{43})$").matcher(authHeader == null ? "" : authHeader);
        if (!tokenMatcher.matches()) throw new ApiError(401, "EXTENSION_UNAUTHENTICATED", "插件授权无效");
        String token = tokenMatcher.group(1);
        List<Map<String, Object>> grants = db.query(
            "SELECT g.id,g.tenant_id,g.user_id FROM resume_extension_grants g JOIN staff_users u ON u.id=g.user_id AND u.tenant_id=g.tenant_id WHERE g.token_hash=$1 AND g.extension_id=$2 AND g.revoked_at IS NULL AND g.expires_at>now() AND u.role IN ('hr','talent_lead')",
            Crypto.digest(token), matcher.group(1));
        if (grants.isEmpty()) throw new ApiError(401, "EXTENSION_UNAUTHENTICATED", "插件授权已失效");
        Map<String, Object> grant = grants.get(0);
        long count = ((Number) db.query("SELECT count(*)::int n FROM audit_events WHERE tenant_id=$1 AND actor_id=$2 AND action='extension.import' AND created_at>now()-interval '1 hour'",
            grant.get("tenant_id"), grant.get("user_id")).get(0).get("n")).longValue();
        if (count >= 100) throw new ApiError(429, "RATE_LIMITED", "插件每小时最多100次导入，请稍后再试");
        Map<String, Object> result = importResume(parseImport(body, true), String.valueOf(grant.get("tenant_id")), String.valueOf(grant.get("user_id")));
        db.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,'extension.import',$4)",
            UUID.randomUUID().toString(), grant.get("tenant_id"), grant.get("user_id"), result.get("resume_version_id"));
        return ResponseEntity.status(Boolean.TRUE.equals(result.get("duplicate")) ? 200 : 201).body(result);
    }

    static GuardsFilter.Auth auth(HttpServletRequest request) {
        return (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
    }

    /** JS String.prototype.split semantics: no trailing empty string when the
     *  separator matches at the end (interior empties are kept). */
    static List<String> jsSplit(String text, String regex) {
        List<String> parts = new ArrayList<>(List.of(text.split(regex, -1)));
        if (parts.size() > 1 && parts.get(parts.size() - 1).isEmpty()) parts.remove(parts.size() - 1);
        return parts;
    }


    /** JS split(/
?
/) semantics — CRLF aware, no trailing empty part. */
    static List<String> jsSplitRegex(String text) {
        List<String> parts = new ArrayList<>(List.of(text.split("\r\n|\n", -1)));
        if (parts.size() > 1 && parts.get(parts.size() - 1).isEmpty()) parts.remove(parts.size() - 1);
        return parts;
    }

    static String str(Map<String, Object> body, String key) {
        if (body == null) return null;
        Object v = body.get(key);
        return v == null ? null : String.valueOf(v);
    }
}
