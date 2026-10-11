package cn.iqilun.common;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** JsonNode → ordered plain Java values (maps keep file/key order). */
public final class JdbcJson {
    private JdbcJson() {}

    public static Object convert(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isObject()) {
            Map<String, Object> out = new LinkedHashMap<>();
            node.fields().forEachRemaining(e -> out.put(e.getKey(), convert(e.getValue())));
            return out;
        }
        if (node.isArray()) {
            List<Object> out = new ArrayList<>(node.size());
            for (JsonNode child : node) out.add(convert(child));
            return out;
        }
        if (node.isTextual()) return node.asText();
        if (node.isIntegralNumber()) return node.canConvertToLong() ? (Object) node.asLong() : (Object) node.asText();
        if (node.isFloatingPointNumber()) return node.asDouble();
        if (node.isBoolean()) return node.asBoolean();
        return null;
    }
}
