package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Legacy-parity request pipeline: per-request id, loopback source gate for
 * /api, Origin gate for mutations, then cookie-session resolution with the
 * x-csrf-token check for mutations. Auth-exempt paths (health, auth/options,
 * auth/login) mirror the registration order of the legacy Express app; the
 * public invite paths arrive with the R2 modules.
 */
@Component
public class GuardsFilter extends OncePerRequestFilter {

    public static final String REQUEST_ID = "qilun.requestId";
    public static final String AUTH = "qilun.auth";

    private final Db db;
    private final ApiProperties properties;

    public GuardsFilter(Db db, ApiProperties properties) {
        this.db = db;
        this.properties = properties;
    }

    public record Auth(String tenantId, String userId, String role, String username, String csrfToken) {}

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws jakarta.servlet.ServletException, IOException {
        String requestId = UUID.randomUUID().toString();
        request.setAttribute(REQUEST_ID, requestId);
        response.setHeader("X-Request-Id", requestId);
        try {
            String path = request.getRequestURI();
            if (path.startsWith("/api") && !path.startsWith("/api/v3/")) {
                // loopback source gate (same trust model as the legacy deployment behind nginx)
                String remote = request.getRemoteAddr();
                boolean loopback = "127.0.0.1".equals(remote) || "0:0:0:0:0:0:0:1".equals(remote) || "::1".equals(remote);
                if (!loopback) throw new ApiError(403, "ORIGIN_REJECTED", "请求来源不允许");
                // origin gate for mutations
                if (!"GET".equals(request.getMethod()) && !"HEAD".equals(request.getMethod()) && !"OPTIONS".equals(request.getMethod())) {
                    String origin = request.getHeader("Origin");
                    if (!properties.getOrigin().equals(origin == null ? "" : origin)) {
                        throw new ApiError(403, "ORIGIN_REJECTED", "请求来源不允许");
                    }
                }
                // session gate (mirrors the legacy middleware registration order)
                if (!isAuthExempt(path)) {
                    if (IamController.iamEnabled()) {
                        try {
                            Map<String, String> iamConfig = IamController.config();
                            IamController iam = ApplicationContextProvider.bean(IamController.class);
                            Map<String, Object> current = iam.currentSession(request, iamConfig);
                            if (current == null) throw new ApiError(401, "UNAUTHENTICATED", "请使用齐论账号登录");
                            Map<String, Object> local = current.get("local") instanceof Map<?, ?> lm ? castMap(lm) : null;
                            if (local == null || !List.of("hr", "talent_lead", "ops", "interviewer").contains(local.get("role")))
                                throw new ApiError(403, "IAM_FORBIDDEN", "统一身份授权范围不正确");
                            Auth auth = new Auth(str(local.get("tenant_id")), str(local.get("user_id")),
                                str(local.get("role")), str(local.get("username")), str(current.get("csrf")));
                            request.setAttribute(AUTH, auth);
                            if (!"GET".equals(request.getMethod()) && !"HEAD".equals(request.getMethod()) && !"OPTIONS".equals(request.getMethod())) {
                                String csrf = request.getHeader("x-csrf-token");
                                if (csrf == null || !csrf.equals(auth.csrfToken())) throw new ApiError(403, "CSRF_REJECTED", "会话校验失败，请刷新后重试");
                            }
                            chain.doFilter(request, response);
                            return;
                        } catch (ApiError e) {
                            org.slf4j.LoggerFactory.getLogger(GuardsFilter.class)
                                .warn("API_ERROR {} {} -> {} {}", request.getMethod(), request.getRequestURI()
                                    + (request.getQueryString() == null ? "" : "?" + request.getQueryString()), e.status, e.code);
                            response.setStatus(e.status);
                            response.setContentType("application/json");
                            response.setCharacterEncoding("UTF-8");
                            String fields = e.fields == null ? "" : ",\"fields\":[]";
                            response.getWriter().write("{\"error\":{\"code\":\"" + e.code + "\",\"message\":\"" + e.getMessage() + "\"" + fields + "},\"request_id\":\"" + requestId + "\"}");
                            return;
                        } catch (Exception e) {
                            org.slf4j.LoggerFactory.getLogger(GuardsFilter.class)
                                .error("INTERNAL_ERROR {} {}", request.getMethod(), request.getRequestURI(), e);
                            response.setStatus(500);
                            response.setContentType("application/json");
                            response.setCharacterEncoding("UTF-8");
                            response.getWriter().write("{\"error\":{\"code\":\"INTERNAL_ERROR\",\"message\":\"服务错误，请凭请求编号联系管理员\"},\"request_id\":\"" + requestId + "\"}");
                            return;
                        }
                    }
                    String token = cookieValue(request);
                    if (token == null) throw new ApiError(401, "UNAUTHENTICATED", "请先登录");
                    List<Map<String, Object>> rows = db.query(
                        "SELECT s.tenant_id,s.user_id,s.csrf_token,u.role,u.username FROM sessions s " +
                        "JOIN staff_users u ON u.tenant_id=s.tenant_id AND u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
                        Crypto.digest(token));
                    if (rows.isEmpty()) throw new ApiError(401, "UNAUTHENTICATED", "登录已失效");
                    Map<String, Object> row = rows.get(0);
                    Auth auth = new Auth(str(row.get("tenant_id")), str(row.get("user_id")), str(row.get("role")), str(row.get("username")), str(row.get("csrf_token")));
                    request.setAttribute(AUTH, auth);
                    if (!"GET".equals(request.getMethod()) && !"HEAD".equals(request.getMethod()) && !"OPTIONS".equals(request.getMethod())) {
                        String csrf = request.getHeader("x-csrf-token");
                        if (csrf == null || !csrf.equals(auth.csrfToken())) throw new ApiError(403, "CSRF_REJECTED", "会话校验失败，请刷新后重试");
                    }
                }
            }
            chain.doFilter(request, response);
        } catch (ApiError e) {
            org.slf4j.LoggerFactory.getLogger(GuardsFilter.class)
                .warn("API_ERROR {} {} -> {} {}", request.getMethod(), request.getRequestURI()
                    + (request.getQueryString() == null ? "" : "?" + request.getQueryString()), e.status, e.code);
            response.setStatus(e.status);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            String fields = e.fields == null ? "" : ",\"fields\":[]";
            response.getWriter().write("{\"error\":{\"code\":\"" + e.code + "\",\"message\":\"" + e.getMessage() + "\"" + fields + "},\"request_id\":\"" + requestId + "\"}");
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(GuardsFilter.class).error("INTERNAL_ERROR_FILTER", e);
            response.setStatus(500);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"error\":{\"code\":\"INTERNAL_ERROR\",\"message\":\"服务错误，请凭请求编号联系管理员\"},\"request_id\":\"" + requestId + "\"}");
        }
    }

    private boolean isAuthExempt(String path) {
        return "/api/v1/health".equals(path) || "/api/v1/auth/options".equals(path) || "/api/v1/auth/login".equals(path)
            || path.startsWith("/api/v1/public/") || path.startsWith("/api/iam/");
    }

    static String cookieValue(HttpServletRequest request) {
        String cookies = request.getHeader("Cookie");
        if (cookies == null) return null;
        for (String part : cookies.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith("qilun_session=")) return trimmed.substring("qilun_session=".length());
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object o) { return (Map<String, Object>) o; }

    static String str(Object value) {
        return value == null ? null : value.toString();
    }
}
