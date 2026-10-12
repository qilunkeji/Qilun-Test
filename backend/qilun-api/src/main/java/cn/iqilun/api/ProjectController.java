package cn.iqilun.api;

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

/** Project groups ported from project-routes.ts (CRUD + assignment + archive binding). */
@RestController
public class ProjectController {

    private final Db db;

    public ProjectController(Db db) { this.db = db; }

    private static GuardsFilter.Auth hr(HttpServletRequest request) {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("hr", "talent_lead").contains(auth.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无档案管理权限");
        return auth;
    }

    private static ApiError notFound(String message) { return new ApiError(404, "NOT_FOUND", message); }

    @GetMapping("/api/v1/project-groups")
    public Map<String, Object> list(HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = hr(request);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", db.query("SELECT id,name FROM talent_project_groups WHERE tenant_id=$1 ORDER BY name,id", a.tenantId()));
        return out;
    }

    @PostMapping("/api/v1/project-groups")
    public ResponseEntity<Map<String, Object>> create(@RequestBody(required = false) Map<String, Object> body,
                                                      HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = hr(request);
        String name = body == null ? null : String.valueOf(body.get("name"));
        if (name == null || name.isBlank() || name.length() > 80 || body.size() != 1)
            throw ResumeController.invalidInput();
        String id = UUID.randomUUID().toString();
        db.tx(tx -> {
            if (!tx.query("SELECT id FROM talent_project_groups WHERE tenant_id=$1 AND lower(name)=lower($2)", a.tenantId(), name.trim()).isEmpty())
                throw new ApiError(409, "PROJECT_EXISTS", "项目组名称已存在");
            tx.query("INSERT INTO talent_project_groups(id,tenant_id,name,created_by) VALUES($1,$2,$3,$4)", id, a.tenantId(), name.trim(), a.userId());
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), "project.created", id);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", name.trim());
        return ResponseEntity.status(201).body(out);
    }

    private void assign(String table, String id, HttpServletRequest request, Map<String, Object> body) throws Exception {
        GuardsFilter.Auth a = hr(request);
        String projectGroupId = body == null || body.get("project_group_id") == null ? null : String.valueOf(body.get("project_group_id"));
        String previousGroupId = body == null || body.get("previous_group_id") == null ? null : String.valueOf(body.get("previous_group_id"));
        if (body == null || body.keySet().stream().anyMatch(k -> !List.of("project_group_id", "previous_group_id").contains(k)))
            throw ResumeController.invalidInput();
        AssessmentSupport.checkProject(db, a.tenantId(), projectGroupId);
        db.tx(tx -> {
            List<Map<String, Object>> rows = tx.query("SELECT project_group_id FROM " + table + " WHERE tenant_id=$1 AND id=$2"
                + ("candidates".equals(table) ? " AND retention_until>now()" : "") + " FOR UPDATE", a.tenantId(), id);
            if (rows.isEmpty()) throw notFound("记录不可访问");
            Object current = rows.get(0).get("project_group_id");
            if (!String.valueOf(current).equals(String.valueOf(previousGroupId)))
                throw new ApiError(409, "GROUP_CONFLICT", "分组已更新，请刷新后重试");
            tx.query("UPDATE " + table + " SET project_group_id=$3 WHERE tenant_id=$1 AND id=$2", a.tenantId(), id, projectGroupId);
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), "project.assigned", id);
            return null;
        });
    }

    @PostMapping("/api/v1/talents/{id}/project")
    public Map<String, Object> assignTalent(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                            HttpServletRequest request) throws Exception {
        assign("candidates", id, request, body);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("project_group_id", body == null || body.get("project_group_id") == null ? null : String.valueOf(body.get("project_group_id")));
        return out;
    }

    @PostMapping("/api/v1/assessment/invites/{id}/project")
    public Map<String, Object> assignInvite(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                            HttpServletRequest request) throws Exception {
        assign("assessment_invites", id, request, body);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("project_group_id", body == null || body.get("project_group_id") == null ? null : String.valueOf(body.get("project_group_id")));
        return out;
    }

    @PostMapping("/api/v1/assessment/invites/{id}/bind")
    public Map<String, Object> bind(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body,
                                    HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = hr(request);
        String candidateId = body == null ? null : String.valueOf(body.get("candidate_id"));
        if (candidateId == null || body.size() != 2 || !"bind_assessment".equals(body.get("confirm")))
            throw ResumeController.invalidInput();
        db.tx(tx -> {
            List<Map<String, Object>> invites = tx.query(
                "SELECT candidate_id FROM assessment_invites WHERE tenant_id=$1 AND id=$2 AND (candidate_id IS NOT NULL OR independent_retention_until>now()) FOR UPDATE",
                a.tenantId(), id);
            if (invites.isEmpty()) throw notFound("测评不可访问");
            if (invites.get(0).get("candidate_id") != null
                || !tx.query("SELECT invite_id FROM assessment_archive_bindings WHERE tenant_id=$1 AND invite_id=$2", a.tenantId(), id).isEmpty())
                throw new ApiError(409, "ALREADY_BOUND", "本次测评已关联档案，不可重复绑定");
            if (tx.query("SELECT id FROM candidates WHERE tenant_id=$1 AND id=$2 AND retention_until>now()", a.tenantId(), candidateId).isEmpty())
                throw notFound("档案不可访问");
            tx.query("INSERT INTO assessment_archive_bindings(invite_id,tenant_id,candidate_id,created_by) VALUES($1,$2,$3,$4)", id, a.tenantId(), candidateId, a.userId());
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), "assessment.archive_bound", id);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("bound", true);
        return out;
    }
}
