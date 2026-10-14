package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * IAM/OIDC ported from apps/api/iam.ts + packages/iam/client.mjs.
 * Sessions/states/events live in PG (iam_sessions/iam_states/iam_events tables,
 * created at startup) instead of the legacy SQLite file. OIDC discovery and the
 * authorization-code+PKCE exchange use java.net.http against the issuer.
 */
@RestController
public class IamController {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(8)).build();

    private final Db db;
    private final ApiProperties properties;

    public IamController(Db db, ApiProperties properties) {
        this.db = db;
        this.properties = properties;
        try {
            db.exec("""
                CREATE TABLE IF NOT EXISTS iam_sessions (hash text PRIMARY KEY, payload jsonb NOT NULL, expires bigint NOT NULL);
                CREATE TABLE IF NOT EXISTS iam_states (hash text PRIMARY KEY, payload jsonb NOT NULL, expires bigint NOT NULL);
                CREATE TABLE IF NOT EXISTS iam_events (id text PRIMARY KEY, created bigint NOT NULL)""");
        } catch (Exception e) {
            throw new IllegalStateException("IAM table bootstrap failed", e);
        }
    }

    /** iamConfig port: returns the config when IAM_ENABLED=1, null otherwise. */
    public static Map<String, String> config() {
        String enabled = System.getenv("IAM_ENABLED");
        if (enabled == null || "0".equals(enabled)) return null;
        if (!"1".equals(enabled)) throw new IllegalStateException("IAM_ENABLED must be 0 or 1");
        String issuer = System.getenv("IAM_ISSUER"), clientId = System.getenv("IAM_CLIENT_ID");
        String clientSecret = System.getenv("IAM_CLIENT_SECRET"), webhookSecret = System.getenv("IAM_WEBHOOK_SECRET");
        String systemId = System.getenv("IAM_SYSTEM_ID"), tenantId = System.getenv("DEFAULT_TENANT_ID");
        String origin = System.getenv("QILUN_ORIGIN");
        if (issuer == null || clientId == null || clientSecret == null || webhookSecret == null
            || systemId == null || tenantId == null || origin == null)
            throw new IllegalStateException("IAM configuration is incomplete");
        if ("production".equals(System.getenv("NODE_ENV")) && (!"https://zh.iqilun.cn".equals(issuer) || !"https://rc.iqilun.cn".equals(origin)))
            throw new IllegalStateException("IAM production origin is invalid");
        Map<String, String> out = new LinkedHashMap<>();
        out.put("issuer", issuer); out.put("clientId", clientId); out.put("clientSecret", clientSecret);
        out.put("webhookSecret", webhookSecret); out.put("systemId", systemId); out.put("tenantId", tenantId); out.put("origin", origin);
        return out;
    }

    public static boolean iamEnabled() { return config() != null; }

    // ---------------------------------------------------------------- selectIAMRole + mapIAMIdentity
    static String selectIAMRole(List<String> roles, List<String> permissions) {
        Map<String, List<String>> needs = Map.of(
            "talent_lead", List.of("talent.view", "talent.manage"),
            "hr", List.of("talent.view", "talent.recruit"),
            "ops", List.of("talent.view", "talent.audit"),
            "interviewer", List.of("talent.view"));
        List<String> matched = new ArrayList<>();
        for (String r : roles) if (needs.containsKey(r)) matched.add(r);
        if (matched.size() > 1) throw new ApiError(403, "IAM_ROLE_CONFLICT", "人才系统仅支持一个业务角色，请联系账号中心管理员保留一个人才角色");
        if (matched.size() != 1 || !permissions.containsAll(needs.get(matched.get(0))))
            throw new ApiError(403, "IAM_FORBIDDEN", "当前齐论账号未获人才系统角色授权");
        return matched.get(0);
    }

    /** mapIAMIdentity port — identity validation + local user provisioning/binding. */
    public static Map<String, Object> mapIdentity(Db db, Map<String, String> config, Map<String, Object> user) throws Exception {
        String id = str(user.get("id"));
        String authUserId = str(user.get("auth_user_id"));
        String systemId = str(user.get("system_id"));
        if (id == null || id.isEmpty() || id.length() > 100 || authUserId == null || systemId == null
            || !"active".equals(str(user.get("status")))
            || Boolean.TRUE.equals(user.get("must_change")) || user.get("deleted_at") != null)
            throw new ApiError(403, "IAM_FORBIDDEN", "齐论账号尚未获授权或需要修改初始密码");
        if (!id.equals(authUserId) || !systemId.equals(config.get("systemId")))
            throw new ApiError(403, "IAM_FORBIDDEN", "齐论账号尚未获授权或需要修改初始密码");
        List<String> roles = strList(user.get("roles"));
        List<String> permissions = strList(user.get("permissions"));
        String role = selectIAMRole(roles, permissions);
        return db.tx(tx -> {
            List<Map<String, Object>> mappings = tx.query(
                "SELECT user_id,tenant_id FROM iam_identities WHERE issuer=$1 AND subject=$2", config.get("issuer"), id);
            Map<String, Object> mapping = mappings.isEmpty() ? null : mappings.get(0);
            String localUserId = user.get("local_user_id") == null ? null : str(user.get("local_user_id"));
            if (mapping != null && (!str(mapping.get("tenant_id")).equals(config.get("tenantId"))
                || (localUserId != null && !str(mapping.get("user_id")).equals(localUserId))))
                throw new ApiError(403, "IAM_BINDING_CONFLICT", "身份绑定不一致，请联系管理员核验");
            if (mapping == null) {
                String uid = localUserId != null ? localUserId : UUID.randomUUID().toString();
                if (localUserId != null) {
                    List<Map<String, Object>> exists = tx.query("SELECT id FROM staff_users WHERE tenant_id=$1 AND id=$2", config.get("tenantId"), uid);
                    if (exists.isEmpty()) throw new ApiError(403, "IAM_BINDING_CONFLICT", "管理员指定的原账号不存在");
                    if (!tx.query("SELECT subject FROM iam_identities WHERE tenant_id=$1 AND user_id=$2", config.get("tenantId"), uid).isEmpty())
                        throw new ApiError(403, "IAM_BINDING_CONFLICT", "原账号已绑定另一统一身份");
                } else {
                    String username = "iam_" + Crypto.digest(config.get("issuer") + "|" + id).substring(0, 32);
                    tx.query("INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)",
                        uid, config.get("tenantId"), username, "iam-only", role);
                }
                tx.query("INSERT INTO iam_identities(issuer,subject,tenant_id,user_id) VALUES($1,$2,$3,$4)",
                    config.get("issuer"), id, config.get("tenantId"), uid);
                tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",
                    UUID.randomUUID().toString(), config.get("tenantId"), uid,
                    localUserId != null ? "auth.iam.bound" : "auth.iam.provisioned");
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("tenant_id", config.get("tenantId"));
                m.put("user_id", uid);
                mapping = m;
            }
            List<Map<String, Object>> updated = tx.query(
                "UPDATE staff_users SET role=$3 WHERE tenant_id=$1 AND id=$2 AND role<>$3 RETURNING id",
                config.get("tenantId"), mapping.get("user_id"), role);
            if (!updated.isEmpty()) {
                tx.query("DELETE FROM sessions WHERE tenant_id=$1 AND user_id=$2", config.get("tenantId"), mapping.get("user_id"));
                tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",
                    UUID.randomUUID().toString(), config.get("tenantId"), mapping.get("user_id"), "auth.iam.role_updated");
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("tenant_id", config.get("tenantId"));
            out.put("user_id", mapping.get("user_id"));
            out.put("username", str(user.get("username")));
            out.put("role", role);
            return out;
        });
    }

    // ---------------------------------------------------------------- endpoints
    @GetMapping("/api/iam/login")
    public void login(HttpServletRequest request, HttpServletResponse response) throws Exception {
        Map<String, String> config = requireConfig();
        String origin = config.get("origin");
        String returnTo = request.getParameter("returnTo");
        if (returnTo == null || returnTo.isEmpty()) returnTo = "/";
        if (!returnTo.matches("^/[^/].*") || returnTo.contains("\\") || returnTo.contains("\r") || returnTo.contains("\n"))
            throw new ApiError(400, "INVALID_INPUT", "返回地址无效");
        db.query("DELETE FROM iam_states WHERE expires<$1", System.currentTimeMillis());
        db.query("DELETE FROM iam_sessions WHERE expires<$1", System.currentTimeMillis());
        long stateCount = ((Number) db.query("SELECT count(*)::int n FROM iam_states").get(0).get("n")).longValue();
        if (stateCount >= 1000) throw new ApiError(429, "RATE_LIMITED", "登录请求过多，请稍后重试");
        String state = randomToken();
        String nonce = randomToken();
        String verifier = randomToken();
        String challenge = Crypto.digest(verifier);
        // authorization URL per OIDC Core: PKCE S256, prompt=consent for refresh token
        String authUrl = config.get("issuer") + "/authorize"
            + "?client_id=" + config.get("clientId")
            + "&redirect_uri=" + origin + "/api/iam/callback"
            + "&scope=openid+profile+offline_access"
            + "&response_type=code&response_mode=query&prompt=consent"
            + "&state=" + state + "&nonce=" + nonce
            + "&code_challenge=" + challenge + "&code_challenge_method=S256";
        db.query("INSERT INTO iam_states(hash,payload,expires) VALUES($1,$2,$3)",
            Crypto.digest(state),
            "{\"state\":\"" + state + "\",\"nonce\":\"" + nonce + "\",\"verifier\":\"" + verifier + "\",\"returnTo\":\"" + returnTo + "\"}",
            System.currentTimeMillis() + 600000);
        response.setStatus(302);
        response.setHeader("Location", authUrl);
        response.addHeader("Set-Cookie", iamStateCookie(state, state, 600, origin));
    }

    @GetMapping("/api/iam/callback")
    public void callback(HttpServletRequest request, HttpServletResponse response) throws Exception {
        Map<String, String> config = requireConfig();
        String state = request.getParameter("state");
        String code = request.getParameter("code");
        if (state == null || state.isEmpty() || code == null || code.isEmpty())
            throw new ApiError(400, "INVALID_INPUT", "登录状态校验失败");
        List<Map<String, Object>> rows = db.query("SELECT payload FROM iam_states WHERE hash=$1 AND expires>$2",
            Crypto.digest(state), System.currentTimeMillis());
        if (rows.isEmpty()) throw new ApiError(400, "INVALID_INPUT", "登录请求已过期或已经使用");
        db.query("DELETE FROM iam_states WHERE hash=$1", Crypto.digest(state));
        Map<String, Object> pending = payloadOf(rows.get(0).get("payload"));
        // token exchange
        String tokenEndpoint = config.get("issuer") + "/token";
        String form = "grant_type=authorization_code&code=" + code
            + "&redirect_uri=" + config.get("origin") + "/api/iam/callback"
            + "&client_id=" + config.get("clientId") + "&client_secret=" + config.get("clientSecret")
            + "&code_verifier=" + pending.get("verifier");
        HttpResponse<String> tokenRes = HTTP.send(HttpRequest.newBuilder(URI.create(tokenEndpoint))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(form)).build(), HttpResponse.BodyHandlers.ofString());
        if (tokenRes.statusCode() != 200) throw new ApiError(403, "IAM_FORBIDDEN", "统一身份或刷新令牌缺失");
        Map<String, Object> tokens = MAPPER.readValue(tokenRes.body(), Map.class);
        String subject = str(tokens.get("sub")) != null ? str(tokens.get("sub")) : str(decodeJwtSub(str(tokens.get("id_token"))));
        if (subject == null || tokens.get("refresh_token") == null)
            throw new ApiError(403, "IAM_FORBIDDEN", "统一身份或刷新令牌缺失");
        // live user check
        Map<String, Object> user = liveUser(config, str(tokens.get("access_token")));
        mapIdentity(db, config, user);
        String sessionToken = randomToken();
        long expiresIn = tokens.get("expires_in") instanceof Number n ? n.longValue() : 600;
        Map<String, Object> sessionPayload = new LinkedHashMap<>(tokens);
        sessionPayload.put("subject", subject);
        sessionPayload.put("csrf", randomToken());
        sessionPayload.put("expires_at", System.currentTimeMillis() + expiresIn * 1000);
        db.query("INSERT INTO iam_sessions(hash,payload,expires) VALUES($1,$2,$3)",
            Crypto.digest(sessionToken), cn.iqilun.engine.JsJson.stringify(sessionPayload), System.currentTimeMillis() + 28800000L);
        response.setStatus(302);
        response.setHeader("Location", String.valueOf(pending.get("returnTo")));
        response.addHeader("Set-Cookie", iamSessionCookie(sessionToken, 28800, config.get("origin")));
        response.addHeader("Set-Cookie", iamStateCookie(state, "", 0, config.get("origin")));
    }

    @PostMapping("/api/iam/webhook")
    public Map<String, Object> webhook(HttpServletRequest request, @RequestBody(required = false) String rawBody) throws Exception {
        try { return webhookInner(request, rawBody); }
        catch (ApiError e) { throw convertIamError(e); }
        catch (Exception e) { throw new ApiError(503, "IAM_UNAVAILABLE", "统一账号服务暂不可用，请稍后重试"); }
    }

    private Map<String, Object> webhookInner(HttpServletRequest request, String rawBody) throws Exception {
        Map<String, String> config = requireConfig();
        String timestamp = request.getHeader("x-iam-timestamp");
        String signature = request.getHeader("x-iam-signature");
        if (timestamp == null || !timestamp.matches("^\\d+$") || Math.abs(System.currentTimeMillis() - Long.parseLong(timestamp)) > 300000)
            throw new ApiError(401, "INVALID_INPUT", "同步签名已过期");
        if (rawBody == null || rawBody.getBytes(StandardCharsets.UTF_8).length > 256000)
            throw new ApiError(413, "INVALID_INPUT", "同步数据过大");
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(config.get("webhookSecret").getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String expected = bytesToHex(mac.doFinal((timestamp + "." + rawBody).getBytes(StandardCharsets.UTF_8)));
        if (signature == null || !signature.matches("^[0-9a-f]{64}$") || !expected.equals(signature))
            throw new ApiError(401, "INVALID_INPUT", "同步签名无效");
        Map<String, Object> event = MAPPER.readValue(rawBody, Map.class);
        Map<String, Object> user = event.get("user") instanceof Map<?, ?> u ? cast(u) : null;
        if (!(event.get("event_id") instanceof String eventId) || eventId.length() > 128
            || user == null || !(user.get("id") instanceof String)
            || !config.get("systemId").equals(event.get("system_id")))
            throw new ApiError(400, "INVALID_INPUT", "同步事件格式错误");
        if (db.query("SELECT id FROM iam_events WHERE id=$1", eventId).isEmpty()) {
            // Invalidate first; stale webhook never re-creates an old grant.
            db.query("DELETE FROM iam_sessions WHERE payload->>'subject'=$1", user.get("id"));
            HttpResponse<String> lookup = HTTP.send(HttpRequest.newBuilder(URI.create(
                    config.get("issuer") + "/api/v1/service/users/" + user.get("id")))
                .header("x-client-id", config.get("clientId"))
                .header("x-client-secret", config.get("clientSecret"))
                .GET().build(), HttpResponse.BodyHandlers.ofString());
            if (lookup.statusCode() == 200) {
                Map<String, Object> full = MAPPER.readValue(lookup.body(), Map.class);
                try { mapIdentity(db, config, full); }
                catch (ApiError e) { if (e.status != 403) throw e; }
            } else if (lookup.statusCode() != 403) {
                throw new ApiError(lookup.statusCode() == 401 ? 401 : 503, "IAM_ERROR", "同步查询失败");
            }
            db.query("INSERT INTO iam_events(id,created) VALUES($1,$2)", eventId, System.currentTimeMillis());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("event_id", eventId);
        return out;
    }

    @GetMapping("/api/iam/session")
    public Map<String, Object> session(HttpServletRequest request) throws Exception {
        Map<String, String> config = requireConfig();
        Map<String, Object> current = currentSession(request, config);
        Map<String, Object> out = new LinkedHashMap<>();
        if (current == null) {
            out.put("user", null);
        } else {
            Map<String, Object> user = new LinkedHashMap<>();
            user.put("id", current.get("id"));
            user.put("name", current.get("name"));
            user.put("roles", current.get("roles"));
            user.put("permissions", current.get("permissions"));
            user.put("csrf", current.get("csrf"));
            out.put("user", user);
        }
        return out;
    }

    @PostMapping("/api/iam/logout")
    public Map<String, Object> logout(HttpServletRequest request, HttpServletResponse response) throws Exception {
        Map<String, String> config = requireConfig();
        if (!config.get("origin").equals(request.getHeader("Origin")))
            throw new ApiError(403, "ORIGIN_REJECTED", "请求来源无效");
        String cookie = getIamCookie(request, config);
        List<Map<String, Object>> rows = db.query("SELECT payload FROM iam_sessions WHERE hash=$1 AND expires>$2",
            Crypto.digest(cookie), System.currentTimeMillis());
        if (rows.isEmpty()) throw new ApiError(403, "CSRF_REJECTED", "会话校验失败");
        Map<String, Object> payload = payloadOf(rows.get(0).get("payload"));
        if (!String.valueOf(request.getHeader("x-csrf-token")).equals(payload.get("csrf")))
            throw new ApiError(403, "CSRF_REJECTED", "会话校验失败");
        db.query("DELETE FROM iam_sessions WHERE hash=$1", Crypto.digest(cookie));
        response.addHeader("Set-Cookie", iamSessionCookie("", 0, config.get("origin")));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    // ---------------------------------------------------------------- helpers
    /** iamError port (app.ts:59-62): SDK errors converted to standardized IAM error codes. */
    static ApiError convertIamError(ApiError e) {
        return switch (e.status) {
            case 403 -> new ApiError(403, "IAM_UNAVAILABLE", "齐论账号暂无人才系统权限");
            case 401 -> new ApiError(401, "IAM_UNAVAILABLE", "齐论登录已失效，请重新登录");
            case 400 -> new ApiError(400, "IAM_UNAVAILABLE", "统一登录请求无效或已过期");
            case 428 -> new ApiError(428, "IAM_UNAVAILABLE", "请先在齐论账号中心修改初始密码");
            case 413, 429 -> e;
            default -> new ApiError(503, "IAM_UNAVAILABLE", "统一账号服务暂不可用，请稍后重试");
        };
    }

    /** iam_states/iam_sessions.payload arrived as text in the legacy schema and
     * jsonb after the 2026-10-14 rebuild: jsonb comes back as a Map, so
     * String.valueOf() would yield "{nonce=...}" that Jackson rejects. */
    private static Map<String, Object> payloadOf(Object raw) throws Exception {
        if (raw instanceof Map<?, ?> m) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) out.put(String.valueOf(e.getKey()), e.getValue());
            return out;
        }
        return CatalogJson.parse(String.valueOf(raw));
    }

    private Map<String, String> requireConfig() {
        Map<String, String> config = config();
        if (config == null) throw new ApiError(503, "IAM_NOT_CONFIGURED", "统一登录未启用");
        return config;
    }

    /** current() port: read session cookie → verify live user → map identity. */
    public Map<String, Object> currentSession(HttpServletRequest request, Map<String, String> config) throws Exception {
        String cookie = getIamCookie(request, config);
        if (cookie == null || cookie.isEmpty()) return null;
        List<Map<String, Object>> rows = db.query("SELECT payload FROM iam_sessions WHERE hash=$1 AND expires>$2",
            Crypto.digest(cookie), System.currentTimeMillis());
        if (rows.isEmpty()) return null;
        Map<String, Object> payload = payloadOf(rows.get(0).get("payload"));
        try {
            Map<String, Object> user = liveUser(config, str(payload.get("access_token")));
            Map<String, Object> local = mapIdentity(db, config, user);
            Map<String, Object> out = new LinkedHashMap<>(user);
            out.put("local", local);
            out.put("csrf", payload.get("csrf"));
            return out;
        } catch (ApiError e) {
            if (List.of(400, 401, 403, 428).contains(e.status))
                db.query("DELETE FROM iam_sessions WHERE hash=$1", Crypto.digest(cookie));
            throw e;
        }
    }

    private Map<String, Object> liveUser(Map<String, String> config, String accessToken) throws Exception {
        HttpResponse<String> res = HTTP.send(HttpRequest.newBuilder(URI.create(config.get("issuer") + "/api/v1/me"))
            .header("Authorization", "Bearer " + accessToken).GET().build(), HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            int status = List.of(400, 401, 403, 428).contains(res.statusCode()) ? res.statusCode() : 503;
            throw new ApiError(status, "IAM_FORBIDDEN", "统一账号失效、未授权或需要修改初始密码");
        }
        if (res.body().length() > 65536) throw new ApiError(503, "IAM_ERROR", "统一身份响应过大");
        return MAPPER.readValue(res.body(), Map.class);
    }

    private String getIamCookie(HttpServletRequest request, Map<String, String> config) {
        String cookieName = "iam_" + Crypto.digest(config.get("clientId")).substring(0, 12);
        String cookies = request.getHeader("Cookie");
        if (cookies == null) return null;
        for (String part : cookies.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith(cookieName + "=")) return trimmed.substring(cookieName.length() + 1);
        }
        return null;
    }

    private String iamSessionCookie(String value, int maxAge, String origin) {
        return "iam_" + "session=" + value + "; Path=/api; HttpOnly; SameSite=Lax; Max-Age=" + maxAge
            + (origin.startsWith("https:") ? "; Secure" : "");
    }

    private String iamStateCookie(String state, String value, int maxAge, String origin) {
        String name = "iam_" + "state_" + Crypto.digest(state).substring(0, 16);
        return name + "=" + value + "; Path=/api; HttpOnly; SameSite=Lax; Max-Age=" + maxAge
            + (origin.startsWith("https:") ? "; Secure" : "");
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(64);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    /** Decode JWT payload sub claim without full verification (token exchange already authenticated). */
    private static String decodeJwtSub(String jwt) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) return null;
            String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            Map<String, Object> claims = MAPPER.readValue(payload, Map.class);
            return str(claims.get("sub"));
        } catch (Exception e) { return null; }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> cast(Map<?, ?> m) { return (Map<String, Object>) m; }
    private static String str(Object v) { return v == null ? null : String.valueOf(v); }
    @SuppressWarnings("unchecked")
    private static List<String> strList(Object v) { return v instanceof List<?> l ? (List<String>) l : List.of(); }
}
