package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Legacy-parity auth endpoints (key order, error codes, rate limits and cookie
 * semantics mirror apps/api/app.ts:105-161). Differ-gated.
 */
@RestController
public class AuthController {

    private static final Pattern TEXT100 = Pattern.compile("^\\S.{0,98}\\S$|^\\S$"); // legacy text(100): trimmed 1..100

    private final Db db;
    private final ApiProperties properties;
    private final String dummyHash = Crypto.hashPassword(Crypto.randomToken());
    private final Map<String, int[]> failures = new ConcurrentHashMap<>(); // key -> {count, untilEpochMs}

    public AuthController(Db db, ApiProperties properties) {
        this.db = db;
        this.properties = properties;
    }

    @GetMapping("/api/v1/auth/options")
    public Map<String, Object> options() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("unified_login", false);
        out.put("local_password_login", true);
        out.put("login_url", null);
        return out;
    }

    @PostMapping("/api/v1/auth/login")
    public Map<String, Object> login(@RequestBody(required = false) Map<String, Object> body,
                                     HttpServletRequest request, HttpServletResponse response) throws Exception {
        String tenantIdIn = body == null ? null : str(body.get("tenant_id"));
        String username = body == null ? null : str(body.get("username"));
        String password = body == null ? null : str(body.get("password"));
        if (username == null || password == null || username.isBlank() || password.isEmpty()
            || username.length() > 100 || password.length() > 256 || (body != null && (body.containsKey("tenant_id") && tenantIdIn == null))) {
            throw invalidInput();
        }
        String tenantId;
        if (tenantIdIn != null) {
            List<Map<String, Object>> rows = db.query("SELECT id FROM tenants WHERE id=$1", tenantIdIn);
            if (rows.isEmpty()) throw new ApiError(401, "INVALID_CREDENTIALS", "账号或密码不正确");
            tenantId = tenantIdIn;
        } else {
            List<Map<String, Object>> rows = db.query("SELECT id FROM tenants ORDER BY created_at,id LIMIT 2");
            if (rows.size() != 1) throw new ApiError(503, "LOGIN_NOT_CONFIGURED", "登录配置尚未完成，请联系管理员");
            tenantId = str(rows.get(0).get("id"));
        }
        String ip = "127.0.0.1";
        String key = Crypto.digest(ip + "|" + tenantId + "|" + username);
        String ipKey = Crypto.digest("ip:" + ip);
        long now = System.currentTimeMillis();
        bump(key, 0, now); // prune semantics per access
        if (count(key) >= 5 || count(ipKey) >= 40) throw new ApiError(429, "RATE_LIMITED", "登录尝试过多，请15分钟后重试");

        List<Map<String, Object>> rows = db.query(
            "SELECT id,password_hash,role FROM staff_users WHERE tenant_id=$1 AND username=$2 AND password_hash<>'iam-only'", tenantId, username);
        String savedHash = rows.isEmpty() ? dummyHash : str(rows.get(0).get("password_hash"));
        boolean valid = Crypto.verifyPassword(password, savedHash);
        if (rows.isEmpty() || !valid) {
            bump(key, 1, now);
            bump(ipKey, 1, now);
            throw new ApiError(401, "INVALID_CREDENTIALS", "账号或密码不正确");
        }
        failures.remove(key);
        String token = Crypto.randomToken(), csrf = Crypto.randomToken();
        db.tx(tx -> {
            tx.query("DELETE FROM sessions WHERE expires_at<now()");
            tx.query("INSERT INTO sessions VALUES($1,$2,$3,$4,now()+interval '8 hours')", Crypto.digest(token), tenantId, str(rows.get(0).get("id")), csrf);
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)", UUID.randomUUID().toString(), tenantId, str(rows.get(0).get("id")), "auth.login");
            return null;
        });
        StringBuilder cookie = new StringBuilder("qilun_session=").append(token)
            .append("; Path=/api; Max-Age=28800; HttpOnly; SameSite=Strict");
        if (properties.getOrigin().startsWith("https:")) cookie.append("; Secure");
        response.addHeader("Set-Cookie", cookie.toString());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tenant_id", tenantId);
        out.put("username", username);
        out.put("role", str(rows.get(0).get("role")));
        out.put("csrf_token", csrf);
        return out;
    }

    @GetMapping("/api/v1/auth/me")
    public Map<String, Object> me(HttpServletRequest request) throws Exception {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        List<Map<String, Object>> tenant = db.query("SELECT name FROM tenants WHERE id=$1", auth.tenantId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tenant_id", auth.tenantId());
        out.put("user_id", auth.userId());
        out.put("csrf_token", auth.csrfToken());
        out.put("role", auth.role());
        out.put("username", auth.username());
        out.put("tenant_name", str(tenant.get(0).get("name")));
        return out;
    }

    @PostMapping("/api/v1/auth/logout")
    public Map<String, Object> logout(HttpServletRequest request, HttpServletResponse response) throws Exception {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        String token = GuardsFilter.cookieValue(request);
        db.query("DELETE FROM sessions WHERE token_hash=$1", Crypto.digest(token == null ? "" : token));
        response.addHeader("Set-Cookie", "qilun_session=; Path=/api; Max-Age=0; HttpOnly; SameSite=Strict");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("logged_out", true);
        return out;
    }

    private static ApiError invalidInput() {
        return new ApiError(400, "INVALID_INPUT", "输入格式不正确");
    }

    private void bump(String key, int increment, long now) {
        int[] slot = failures.computeIfAbsent(key, k -> new int[]{0, 0});
        if (slot[1] < now) { slot[0] = 0; }
        slot[0] += increment;
        slot[1] = (int) Math.min(Integer.MAX_VALUE, now + 900_000L);
    }

    private int count(String key) {
        int[] slot = failures.get(key);
        return slot == null || slot[1] < System.currentTimeMillis() ? 0 : slot[0];
    }

    static String str(Object value) {
        return value == null ? null : value.toString();
    }
}
