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

/** Recruiting materials ported from recruiting.ts (encrypted at rest, AAD recruiting:<tenant>). */
@RestController
public class RecruitingController {

    private final Db db;
    private final ApiProperties properties;

    public RecruitingController(Db db, ApiProperties properties) {
        this.db = db;
        this.properties = properties;
    }

    private byte[] contactKey() { return InviteAdminController.hexToBytes(properties.getContactKey()); }

    private static void hr(HttpServletRequest request) {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("hr", "talent_lead").contains(auth.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
    }

    private static ApiError notFound() { return new ApiError(404, "NOT_FOUND", "资料不存在"); }

    @GetMapping("/api/v1/recruiting/materials")
    public Map<String, Object> materials(HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", db.query("SELECT id,title,category,source_name,char_count,created_at FROM recruiting_materials WHERE tenant_id=$1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 100", a.tenantId()));
        return out;
    }

    @GetMapping("/api/v1/recruiting/materials/{id}")
    public Map<String, Object> materialDetail(@PathVariable String id, HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        List<Map<String, Object>> rows = db.query("SELECT content_cipher FROM recruiting_materials WHERE id=$1 AND tenant_id=$2 AND archived_at IS NULL", id, a.tenantId());
        if (rows.isEmpty()) throw notFound();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("content", Crypto.decryptContact(String.valueOf(rows.get(0).get("content_cipher")), contactKey(), "recruiting:" + a.tenantId()));
        return out;
    }

    @PostMapping("/api/v1/recruiting/materials")
    public Map<String, Object> createMaterial(@RequestBody(required = false) Map<String, Object> body,
                                              HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        String title = ResumeController.str(body, "title"), category = ResumeController.str(body, "category");
        String sourceName = ResumeController.str(body, "source_name"), content = ResumeController.str(body, "content");
        List<String> allowed = List.of("title", "category", "source_name", "content");
        if (body == null || body.keySet().stream().anyMatch(k -> !allowed.contains(k))
            || title == null || title.isBlank() || title.length() > 120
            || category == null || !List.of("公司介绍", "产品与业务", "团队与福利", "岗位参考", "其他").contains(category)
            || sourceName == null || sourceName.length() > 200
            || content == null || content.trim().length() < 5 || content.length() > 8000)
            throw ResumeController.invalidInput();
        String id = UUID.randomUUID().toString();
        db.tx(tx -> {
            tx.query("INSERT INTO recruiting_materials(id,tenant_id,title,category,source_name,content_cipher,content_hash,char_count,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                id, a.tenantId(), title, category, sourceName,
                Crypto.encryptContact(content, contactKey(), "recruiting:" + a.tenantId()),
                Crypto.digest(content), (long) content.length(), a.userId());
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), a.tenantId(), a.userId(), "recruiting.material_saved", id);
            return null;
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        return out;
    }

    @PostMapping("/api/v1/recruiting/materials/{id}/archive")
    public Map<String, Object> archiveMaterial(@PathVariable String id, HttpServletRequest request) throws Exception {
        hr(request);
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        List<Map<String, Object>> rows = db.query("UPDATE recruiting_materials SET archived_at=now() WHERE id=$1 AND tenant_id=$2 AND archived_at IS NULL RETURNING id", id, a.tenantId());
        if (rows.isEmpty()) throw notFound();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("archived", true);
        return out;
    }
}
