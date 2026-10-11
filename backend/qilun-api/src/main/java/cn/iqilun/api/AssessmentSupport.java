package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Shared assessment helpers ported from assessment-metadata.ts / project-routes.ts. */
public final class AssessmentSupport {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AssessmentSupport() {}

    static void business(GuardsFilter.Auth auth) {
        if (!List.of("hr", "talent_lead").contains(auth.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无测评管理权限");
    }

    /** profileSchema: {name?, phone, birth_date} strict. */
    static Map<String, Object> parseProfile(JsonNode node) {
        if (node == null || !node.isObject()) throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        Map<String, Object> out = new LinkedHashMap<>();
        if (node.has("name")) out.put("name", node.get("name").asText());
        if (node.has("phone")) out.put("phone", node.get("phone").asText());
        if (node.has("birth_date")) out.put("birth_date", node.get("birth_date").asText());
        if (out.containsKey("phone")) {
            String phone = (String) out.get("phone");
            if (!phone.matches("^\\+?[0-9]{7,15}$")) throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        } else throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        if (out.containsKey("birth_date")) {
            String birth = (String) out.get("birth_date");
            if (!birth.matches("^\\d{4}-\\d{2}-\\d{2}$")) throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
            try {
                LocalDate d = LocalDate.parse(birth);
                if (!d.toString().equals(birth) || birth.compareTo("1900-01-01") < 0 || birth.compareTo(LocalDate.now().toString()) > 0)
                    throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
            } catch (java.time.format.DateTimeParseException e) {
                throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
            }
        } else throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        for (String key : List.of("name")) {
            Object v = out.get(key);
            if (v instanceof String s && (s.isBlank() || s.length() > 80)) throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
        }
        for (String field : List.of("name", "phone", "birth_date")) {
            for (String key : iterableFields(node)) if (!List.of("name", "phone", "birth_date").contains(key))
                throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");
            break;
        }
        return out;
    }

    private static List<String> iterableFields(JsonNode node) {
        List<String> out = new java.util.ArrayList<>();
        node.fieldNames().forEachRemaining(out::add);
        return out;
    }

    /** profile JSON string with TS JSON.stringify key order: name, phone, birth_date. */
    static String profileJson(Map<String, Object> profile) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : profile.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(e.getKey()).append("\":\"").append(e.getValue()).append('"');
        }
        return sb.append('}').toString();
    }

    /** reportMetadata: decrypt profile cipher, mask phone, keep TS key order. */
    static Map<String, Object> reportMetadata(String profileCipher, String tenantId, Long activeSeconds, boolean profileRequired, byte[] contactKey) {
        Map<String, Object> profile = null;
        if (profileCipher != null) {
            try {
                profile = parseProfile(MAPPER.readTree(Crypto.decryptContact(profileCipher, contactKey, tenantId)));
            } catch (Exception e) {
                throw new ApiError(500, "INTERNAL_ERROR", "服务错误，请凭请求编号联系管理员");
            }
        }
        Map<String, Object> consistency = new LinkedHashMap<>();
        consistency.put("status", "unavailable");
        consistency.put("label", "未评定");
        consistency.put("reason", "尚无经过验证的逻辑一致性评分规则");
        Map<String, Object> out = new LinkedHashMap<>();
        Object name = profile == null ? null : profile.get("name");
        Object phone = profile == null ? null : profile.get("phone");
        Object birth = profile == null ? null : profile.get("birth_date");
        out.put("participant_name", name);
        out.put("phone", phone == null ? null : maskPhone((String) phone));
        out.put("birth_date", birth);
        out.put("active_seconds", activeSeconds);
        out.put("profile_completed", profile != null && (!profileRequired || name != null));
        out.put("consistency", consistency);
        return out;
    }

    private static String maskPhone(String phone) {
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }

    static Long boundedActiveSeconds(Long prior, Long input, String last, long now) {
        if (input == null) return prior;
        long previous = prior == null ? 0 : prior;
        long delta = 0;
        if (last != null) {
            try {
                long lastMs = java.time.Instant.parse(last).toEpochMilli();
                delta = Math.max(0, (long) Math.ceil((now - lastMs) / 1000.0));
            } catch (Exception ignored) { }
        }
        return Math.min(86400, Math.max(previous, Math.min(input, previous + Math.min(delta, 120) + 2)));
    }

    static void checkProject(Db db, String tenant, String projectGroupId) throws Exception {
        if (projectGroupId != null && db.query("SELECT id FROM talent_project_groups WHERE tenant_id=$1 AND id=$2", tenant, projectGroupId).isEmpty())
            throw new ApiError(404, "PROJECT_UNAVAILABLE", "项目组不可访问");
    }

    /** entry pin: String(100000 + parseInt(hmac_sha256(key, "entry:"+id+":"+token)[0..10], 16) % 900000) */
    static String entryPin(byte[] key, String entryId, String personalToken) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] digest = mac.doFinal(("entry:" + entryId + ":" + personalToken).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            long value = Long.parseLong(hex.substring(0, 10), 16);
            return String.valueOf(100000 + (int) (value % 900000));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

}
