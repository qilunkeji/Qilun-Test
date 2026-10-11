package cn.iqilun.api;

import java.util.List;
import java.util.Map;

/** Mirrors the legacy ApiError: status + code + message (+ optional zod-style fields). */
public class ApiError extends RuntimeException {
    public final int status;
    public final String code;
    public final List<Map<String, String>> fields;

    public ApiError(int status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiError(int status, String code, String message, List<Map<String, String>> fields) {
        super(message);
        this.status = status;
        this.code = code;
        this.fields = fields;
    }
}
