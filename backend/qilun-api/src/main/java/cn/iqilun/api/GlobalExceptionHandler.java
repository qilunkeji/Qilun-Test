package cn.iqilun.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Response envelope parity: {data, request_id} on success (via EnvelopeAdvice), {error:{...}, request_id} on failure. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiError.class)
    public ResponseEntity<Map<String, Object>> apiError(ApiError e, HttpServletRequest request) {
        // 4xx carries no stack but is exactly what "page looks empty" investigations need.
        org.slf4j.LoggerFactory.getLogger(GlobalExceptionHandler.class)
            .warn("API_ERROR {} {} -> {} {}", request.getMethod(), request.getRequestURI()
                + (request.getQueryString() == null ? "" : "?" + request.getQueryString()),
                e.status, e.code);
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", e.code);
        error.put("message", e.getMessage());
        if (e instanceof AssessmentQaController.ApiErrorWithBody withBody) {
            for (Map.Entry<String, Object> extra : withBody.body.entrySet()) {
                if (!"code".equals(extra.getKey()) && !"message".equals(extra.getKey())) error.put(extra.getKey(), extra.getValue());
            }
        }
        if (e.fields != null) {
            error.put("fields", e.fields.stream().map(f -> {
                Map<String, String> out = new LinkedHashMap<>();
                out.put("path", f.get("path"));
                out.put("message", f.get("message"));
                return out;
            }).toList());
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", error);
        body.put("request_id", request.getAttribute(GuardsFilter.REQUEST_ID));
        return ResponseEntity.status(e.status).body(body);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> internal(Exception e, HttpServletRequest request) {
        org.slf4j.LoggerFactory.getLogger(GlobalExceptionHandler.class).error("INTERNAL_ERROR", e);
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", "INTERNAL_ERROR");
        error.put("message", "服务错误，请凭请求编号联系管理员");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", error);
        body.put("request_id", request.getAttribute(GuardsFilter.REQUEST_ID));
        return ResponseEntity.status(500).body(body);
    }
}
