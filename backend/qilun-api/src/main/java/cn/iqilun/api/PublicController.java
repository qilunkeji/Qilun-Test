package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public assessment invite endpoints (no session; token auth), ported from
 * apps/api/invite-routes.ts: rate limit 10 misses / 10 minutes per source,
 * digest(token) lookup, 404 NOT_FOUND on miss with the legacy message.
 */
@RestController
public class PublicController {

    private final Db db;
    private final Map<String, long[]> failures = new ConcurrentHashMap<>(); // digest(ip) -> {count, untilEpochMs}

    public PublicController(Db db) { this.db = db; }

    @PostMapping("/api/v1/public/assessment/open")
    public Map<String, Object> open(@RequestBody(required = false) Map<String, Object> body,
                                    HttpServletRequest request) throws Exception {
        String token = body == null ? null : AuthController.str(body.get("token"));
        String pin = body == null ? null : AuthController.str(body.get("pin"));
        if (token == null || token.length() < 32 || token.length() > 128
            || (pin != null && !pin.matches("^\\d{6}$"))
            || (body != null && body.keySet().stream().anyMatch(k -> !List.of("token", "pin").contains(k)))) {
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确", List.of(
                Map.of("path", token == null || token.length() < 32 || token.length() > 128 ? "token" : "pin",
                       "message", token == null || token.length() < 32 || token.length() > 128
                           ? "Too small: expected string to have >=32 characters"
                           : "Invalid input: expected string, received undefined")));
        }
        String ip = Crypto.digest("127.0.0.1");
        long now = System.currentTimeMillis();
        long[] slot = failures.get(ip);
        if (slot != null && slot[0] >= 10 && slot[1] > now)
            throw new ApiError(429, "RATE_LIMITED", "访问尝试过多，请10分钟后再试");
        String hash = Crypto.digest(token);
        List<Map<String, Object>> rows = db.query(
            "SELECT i.*,coalesce(c.name,'独立测评') AS name FROM assessment_invites i " +
            "LEFT JOIN candidates c ON c.tenant_id=i.tenant_id AND c.id=i.candidate_id " +
            "WHERE i.token_hash=$1 AND (i.pin_required=false OR i.pin_hash=$2) AND i.revoked_at IS NULL " +
            "AND i.expires_at>now() AND NOT EXISTS(SELECT 1 FROM assessment_public_entries e WHERE e.token_hash=i.token_hash) " +
            "AND (c.id IS NULL OR c.retention_until>now())",
            hash, Crypto.digest(hash + ":" + pin));
        if (rows.isEmpty()) {
            long[] s = failures.computeIfAbsent(ip, k -> new long[]{0, 0});
            s[0] += 1;
            s[1] = now + 600_000L;
            throw new ApiError(404, "NOT_FOUND", "对象不存在或不在授权范围内");
        }
        Map<String, Object> row = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        out.put("name", row.get("name"));
        out.put("metadata", null);
        out.put("package", row.get("package"));
        out.put("purpose", row.get("purpose"));
        out.put("expires_at", row.get("expires_at"));
        out.put("answers", row.get("answers"));
        out.put("value_draft", row.get("value_draft") == null
            ? Map.of("selected", List.of(List.of(), List.of(), List.of(), List.of()), "ranked", List.of())
            : row.get("value_draft"));
        out.put("ui_progress", row.get("ui_progress"));
        out.put("revision", row.get("revision"));
        out.put("consented", row.get("consent_at") != null);
        out.put("submitted", row.get("submitted_at") != null);
        out.put("report", row.get("report"));
        out.put("submitted_at", row.get("submitted_at"));
        out.put("package_hash", row.get("package_hash"));
        return out;
    }
}
