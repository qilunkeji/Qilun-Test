package cn.iqilun.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Loads the shared engine data files (the very same JSON assets the TS engine
 * reads from packages/assessment-engine/data) plus the frozen inverse model.
 * JSON is materialized into LinkedHashMap/ArrayList/String/Double so that
 * JsJson.stringify reproduces TS object key order and number formatting.
 */
public final class Catalog {
    public final Map<String, Object> serverRules;
    public final Map<String, Object> derivedCfg;
    public final Map<String, Object> reportTextCfg;
    public final Map<String, Object> rulebook;
    public final Map<String, Object> model;
    public final Map<String, Object> bank;

    public Catalog(Path repoRoot, Path modelFile) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        Path data = repoRoot.resolve("packages/assessment-engine/data");
        serverRules = asMap(convert(mapper.readTree(Files.readString(data.resolve("gh-server-rules.json")))));
        derivedCfg = asMap(convert(mapper.readTree(Files.readString(data.resolve("gh-derived-rules-v22.json")))));
        reportTextCfg = asMap(convert(mapper.readTree(Files.readString(data.resolve("gh-report-text-v1.json")))));
        rulebook = asMap(convert(mapper.readTree(Files.readString(data.resolve("qilun-standard-v1.json")))));
        model = asMap(convert(mapper.readTree(Files.readString(modelFile))));
        bank = asMap(convert(mapper.readTree(Files.readString(data.resolve("question-bank-277.json")))));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    public static Object convert(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isObject()) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Iterator<Map.Entry<String, JsonNode>> it = node.fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> e = it.next();
                out.put(e.getKey(), convert(e.getValue()));
            }
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

    // typed accessors ------------------------------------------------------
    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> listOf(Object value) {
        return (List<Map<String, Object>>) value;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> mapOf(Object value) {
        return (Map<String, Object>) value;
    }

    static double num(Object value) {
        return ((Number) value).doubleValue();
    }

    static long lint(Object value) {
        return ((Number) value).longValue();
    }

    static String str(Object value) {
        return (String) value;
    }
}
