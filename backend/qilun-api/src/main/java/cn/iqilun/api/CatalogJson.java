package cn.iqilun.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Ordered-map JSON parsing for jsonb columns and package payloads. */
final class CatalogJson {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CatalogJson() {}

    static Map<String, Object> parse(String json) throws Exception {
        JsonNode node = MAPPER.readTree(json);
        return (Map<String, Object>) cn.iqilun.engine.Catalog.convert(node);
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> questions(Map<String, Object> pkg) {
        return (List<Map<String, Object>>) pkg.get("questions");
    }

    @SuppressWarnings("unchecked")
    static List<List<String>> valueGroups(Map<String, Object> pkg) {
        List<List<String>> out = new ArrayList<>();
        for (Object group : (List<Object>) pkg.get("value_groups")) {
            List<String> ids = new ArrayList<>();
            for (Object id : (List<Object>) group) ids.add(String.valueOf(id));
            out.add(ids);
        }
        return out;
    }
}
