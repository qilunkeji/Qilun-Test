package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import cn.iqilun.engine.InvitePackages;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Assessment admin + shared-entry flow, ported from invite-routes.ts and
 * public-entry-routes.ts (createSharedEntry / registerPublicEntryAdmin /
 * registerPublicEntryEnrollment / registerInviteAdmin).
 */
@RestController
public class InviteAdminController {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final Db db;
    private final ApiProperties properties;
    private final EngineRuntime engine;

    public InviteAdminController(Db db, ApiProperties properties, EngineRuntime engine) {
        this.db = db;
        this.properties = properties;
        this.engine = engine;
    }

    static ApiError inviteMissing() { return new ApiError(404, "INVITE_UNAVAILABLE", "测评暂不可访问，或已撤销、到期；请联系邀请人。"); }
    static ApiError entryUnavailable() { return new ApiError(404, "ENTRY_UNAVAILABLE", "测评链接无效，或已停止登记、到期。请联系邀请人。"); }

    static String archiveJoin() { return archiveJoinStatic(); }
    static String retained() { return retainedStatic(); }

    static String archiveJoinStatic() {
        return "LEFT JOIN assessment_archive_bindings b ON b.tenant_id=i.tenant_id AND b.invite_id=i.id LEFT JOIN candidates c ON c.tenant_id=i.tenant_id AND c.id=coalesce(i.candidate_id,b.candidate_id)";
    }

    static String retainedStatic() {
        return "((i.candidate_id IS NOT NULL AND c.retention_until>now()) OR (i.candidate_id IS NULL AND i.independent_retention_until>now() AND (b.candidate_id IS NULL OR c.retention_until>now())))";
    }

    private byte[] contactKey() {
        return hexToBytes(properties.getContactKey());
    }

    // ------------------------------------------------------------- people
    @PostMapping("/api/v1/assessment/people")
    public org.springframework.http.ResponseEntity<Map<String, Object>> createPerson(@RequestBody(required = false) Map<String, Object> body,
                                            HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = authBusiness(request);
        String name = strOf(body, "name"), basis = strOf(body, "processing_basis");
        if (name == null || name.isBlank() || name.length() > 80 || basis == null || basis.length() < 5 || basis.length() > 500
            || body.keySet().stream().anyMatch(k -> !List.of("name", "processing_basis").contains(k)))
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        String id = UUID.randomUUID().toString();
        db.tx(tx -> {
            tx.query("INSERT INTO candidates(id,tenant_id,name,purpose,processing_basis,retention_until,created_by) VALUES($1,$2,$3,'talent_pool',$4,now()+interval '365 days',$5)",
                id, a.tenantId(), name, basis, a.userId());
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), "assessment.person_created", id);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        return org.springframework.http.ResponseEntity.status(201).body(out);
    }

    // ------------------------------------------------------------- invites list
    @GetMapping("/api/v1/assessment/invites")
    public Map<String, Object> invites(HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = authBusiness(request);
        List<Map<String, Object>> rows = db.query(
            "SELECT i.id,i.profile_cipher,i.tenant_id,coalesce(i.candidate_id,b.candidate_id) AS candidate_id,i.application_id,coalesce(c.name,'独立测评') AS name,i.project_group_id,i.participant_kind,i.package->>'title' AS title,i.package->>'version' AS version,i.purpose,i.expires_at,i.revoked_at,i.submitted_at,i.revision,i.created_at FROM assessment_invites i "
                + archiveJoin() + " WHERE i.tenant_id=$1 AND " + retained()
                + " AND ($2::text IS NULL OR i.project_group_id::text=$2 OR ($2='ungrouped' AND i.project_group_id IS NULL))"
                + " AND ($3::text IS NULL OR i.participant_kind=$3)"
                + " AND ($4::text='invites' OR i.submitted_at IS NOT NULL)"
                + " ORDER BY CASE WHEN $4::text='reports' THEN i.submitted_at ELSE i.created_at END DESC,i.id DESC",
            a.tenantId(), request.getParameter("group"), request.getParameter("kind"),
            request.getParameter("view") == null ? "invites" : request.getParameter("view"));
        List<Object> items = new ArrayList<>();
        String q = request.getParameter("q") == null ? "" : request.getParameter("q");
        for (Map<String, Object> row : rows) {
            String profileCipher = (String) row.remove("profile_cipher");
            Object tenantId = row.remove("tenant_id");
            Map<String, Object> metadata = AssessmentSupport.reportMetadata(profileCipher, String.valueOf(tenantId), null, false, contactKey());
            Object participantName = metadata.get("participant_name");
            if (participantName != null) row.put("name", participantName);
            if (String.valueOf(row.get("name")).toLowerCase().contains(q.toLowerCase())) items.add(row);
        }
        long page = longOf(request, "page", 1L);
        int from = (int) Math.min(items.size(), (page - 1) * 100);
        int to = (int) Math.min(items.size(), page * 100);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", new ArrayList<>(items.subList(from, to)));
        out.put("total", (long) items.size());
        out.put("page", page);
        out.put("h5_origin", properties.getOrigin());
        out.put("package", InvitePackages.selfReviewPackage());
        out.put("reference_available", true);
        out.put("ability_estimate_available", engine.ready());
        out.put("standard_assessment_available", engine.ready());
        out.put("standard_assessment_version", cn.iqilun.engine.Engine.QILUN_STANDARD_VERSION);
        out.put("limit", 100L);
        return out;
    }

    // ------------------------------------------------------------- invite create -> shared entry
    @PostMapping("/api/v1/assessment/invites")
    public org.springframework.http.ResponseEntity<Map<String, Object>> createInvite(@RequestBody(required = false) Map<String, Object> body,
                                            HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = authBusiness(request);
        if (body == null) throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        String purpose = strOf(body, "purpose");
        Object daysRaw = body.get("days");
        String projectGroupId = strOf(body, "project_group_id");
        String candidateId = strOf(body, "candidate_id");
        String applicationId = strOf(body, "application_id");
        String packageKind = body.get("package_kind") == null ? "gh_reference_277" : String.valueOf(body.get("package_kind"));
        if (purpose == null || purpose.length() < 5 || purpose.length() > 200 || !(daysRaw instanceof Number n && n.intValue() >= 1 && n.intValue() <= 30))
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        if ("self_review_24".equals(packageKind))
            throw new ApiError(409, "STANDARD_ASSESSMENT_REQUIRED", "现在统一提供齐论完整测评，请刷新页面后重新发起邀请。已有测评可继续完成。");
        if (!engine.ready())
            throw new ApiError(503, "STANDARD_RULES_UNAVAILABLE", "测评服务暂不可用，请稍后重试；未创建不完整的测评邀请。");
        if (candidateId == null && applicationId != null)
            throw new ApiError(400, "INVALID_APPLICATION", "独立测评不可关联招聘申请");
        AssessmentSupport.checkProject(db, a.tenantId(), projectGroupId);
        if (candidateId != null && db.query("SELECT retention_until FROM candidates WHERE tenant_id=$1 AND id=$2 AND retention_until>now()", a.tenantId(), candidateId).isEmpty())
            throw inviteMissing();
        if (applicationId != null && db.query("SELECT id FROM applications WHERE tenant_id=$1 AND id=$2 AND candidate_id=$3", a.tenantId(), applicationId, candidateId).isEmpty())
            throw inviteMissing();
        return org.springframework.http.ResponseEntity.status(201).body(
            createSharedEntry(a, "齐论性格与发展测评", purpose, ((Number) daysRaw).intValue(), projectGroupId));
    }

    Map<String, Object> createSharedEntry(GuardsFilter.Auth a, String title, String purpose, int days, String projectGroupId) throws Exception {
        String id = UUID.randomUUID().toString();
        byte[] tokenBytes = new byte[16];
        RANDOM.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        String hash = Crypto.digest(token);
        Map<String, Object> pkg = engine.engine().standardPackage(sha256OfModelFile());
        String pkgJson = cn.iqilun.engine.JsJson.stringify(pkg);
        String expires = Instant.ofEpochMilli(System.currentTimeMillis() + days * 86400000L).toString();
        db.tx(tx -> {
            tx.query("INSERT INTO assessment_public_entries(id,tenant_id,created_by,title,purpose,project_group_id,token_hash,pin_hash,package,package_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
                id, a.tenantId(), a.userId(), title, purpose, projectGroupId, hash, Crypto.digest(Crypto.randomToken()), pkgJson, Crypto.digest(pkgJson), expires);
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), "assessment.public_entry_created", id);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("url", properties.getOrigin() + "/h5#" + token);
        out.put("expires_at", expires);
        return out;
    }

    private String sha256OfModelFile() throws java.io.IOException {
        return EngineRuntime.sha256Hex(java.nio.file.Files.readString(
            java.nio.file.Path.of(properties.getEngineModelFile()), StandardCharsets.UTF_8));
    }

    // ------------------------------------------------------------- public entries admin
    @GetMapping("/api/v1/assessment/public-entries")
    public Map<String, Object> publicEntries(HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = authBusiness(request);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", db.query(
            "SELECT e.id,e.title,e.purpose,e.project_group_id,e.expires_at,e.revoked_at,e.created_at,count(i.id)::int AS participants,count(i.id) FILTER(WHERE i.submitted_at IS NOT NULL)::int AS completed FROM assessment_public_entries e LEFT JOIN assessment_invites i ON i.tenant_id=e.tenant_id AND i.public_entry_id=e.id WHERE e.tenant_id=$1 GROUP BY e.id ORDER BY e.created_at DESC LIMIT 100",
            a.tenantId()));
        return out;
    }

    @PostMapping("/api/v1/assessment/public-entries")
    public org.springframework.http.ResponseEntity<Map<String, Object>> createPublicEntry(@RequestBody(required = false) Map<String, Object> body,
                                                 HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = authBusiness(request);
        if (body == null) throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        String title = strOf(body, "title"), purpose = strOf(body, "purpose"), projectGroupId = strOf(body, "project_group_id");
        Object daysRaw = body.get("days");
        if (title == null || title.isBlank() || title.length() > 80 || purpose == null || purpose.length() < 5 || purpose.length() > 200
            || !(daysRaw instanceof Number n && n.intValue() >= 1 && n.intValue() <= 30))
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        if (!engine.ready()) throw new ApiError(503, "STANDARD_RULES_UNAVAILABLE", "测评服务暂不可用");
        return org.springframework.http.ResponseEntity.status(201).body(
            createSharedEntry(a, title, purpose, ((Number) daysRaw).intValue(), projectGroupId));
    }

    @PostMapping("/api/v1/assessment/public-entries/{id}/revoke")
    public Map<String, Object> revokeEntry(@PathVariable String id, HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = authBusiness(request);
        List<Map<String, Object>> rows = db.query("UPDATE assessment_public_entries SET revoked_at=coalesce(revoked_at,now()) WHERE tenant_id=$1 AND id=$2 RETURNING id", a.tenantId(), id);
        if (rows.isEmpty()) throw entryUnavailable();
        db.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
            UUID.randomUUID().toString(), a.tenantId(), a.userId(), "assessment.public_entry_revoked", id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("revoked", true);
        return out;
    }

    // ------------------------------------------------------------- invite revoke / report / delete
    @PostMapping("/api/v1/assessment/invites/{id}/revoke")
    public Map<String, Object> revokeInvite(@PathVariable String id, HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = authBusiness(request);
        List<Map<String, Object>> rows = db.query("UPDATE assessment_invites SET revoked_at=coalesce(revoked_at,now()) WHERE tenant_id=$1 AND id=$2 RETURNING id", a.tenantId(), id);
        if (rows.isEmpty()) throw inviteMissing();
        db.query("UPDATE assessment_public_entries SET revoked_at=coalesce(revoked_at,now()) WHERE tenant_id=$1 AND legacy_invite_id=$2", a.tenantId(), id);
        db.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
            UUID.randomUUID().toString(), a.tenantId(), a.userId(), "assessment.revoked", id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("revoked", true);
        return out;
    }

    @GetMapping("/api/v1/assessment/invites/{id}/report")
    public Map<String, Object> inviteReport(@PathVariable String id, HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = authBusiness(request);
        List<Map<String, Object>> rows = db.query(
            "SELECT i.id,i.tenant_id,i.profile_cipher,i.active_seconds,coalesce(c.name,'独立测评') AS name,i.package_hash,i.report,i.submitted_at FROM assessment_invites i "
                + archiveJoin() + " WHERE i.tenant_id=$1 AND i.id=$2 AND " + retained() + " AND i.submitted_at IS NOT NULL",
            a.tenantId(), id);
        if (rows.isEmpty()) throw inviteMissing();
        Map<String, Object> row = rows.get(0);
        String profileCipher = (String) row.remove("profile_cipher");
        String tenantId = (String) row.remove("tenant_id");
        Map<String, Object> metadata = AssessmentSupport.reportMetadata(profileCipher, tenantId,
            row.get("active_seconds") == null ? null : ((Number) row.get("active_seconds")).longValue(), false, contactKey());
        Map<String, Object> out = new LinkedHashMap<>(row);
        Object participantName = metadata.get("participant_name");
        if (participantName != null) out.put("name", participantName);
        out.put("metadata", metadata);
        return out;
    }

    @PostMapping("/api/v1/assessment/invites/{id}/delete")
    public Map<String, Object> deleteInvite(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                            HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = authBusiness(request);
        if (!"talent_lead".equals(a.role())) throw new ApiError(403, "FORBIDDEN_SCOPE", "仅人才负责人可以删除测评数据");
        if (body == null || !"delete_assessment".equals(body.get("confirm")))
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        db.tx(tx -> {
            tx.query("UPDATE assessment_public_entries SET revoked_at=coalesce(revoked_at,now()) WHERE tenant_id=$1 AND legacy_invite_id=$2", a.tenantId(), id);
            List<Map<String, Object>> deleted = tx.query("DELETE FROM assessment_invites WHERE tenant_id=$1 AND id=$2 RETURNING id", a.tenantId(), id);
            if (deleted.isEmpty()) throw inviteMissing();
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), "assessment.deleted", id);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", true);
        out.put("scope", "当前数据库中的本次邀请、答卷和报告；不包含既有离线备份或已下载文件");
        return out;
    }

    static GuardsFilter.Auth authBusiness(HttpServletRequest request) {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        AssessmentSupport.business(auth);
        return auth;
    }

    static String strOf(Map<String, Object> body, String key) {
        if (body == null) return null;
        Object v = body.get(key);
        return v == null ? null : String.valueOf(v);
    }

    static long longOf(HttpServletRequest request, String key, long dflt) {
        String raw = request.getParameter(key);
        if (raw == null || raw.isEmpty()) return dflt;
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException e) {
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        }
    }

    static byte[] hexToBytes(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(hex.substring(2 * i, 2 * i + 2), 16);
        return out;
    }
}
