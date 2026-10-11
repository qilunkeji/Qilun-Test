package cn.iqilun.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;

/** zod JSON schemas extracted from the legacy definitions (agent-schemas.json), key order preserved. */
public final class AgentSchemas {

    private static final Map<String, Object> ROOT;
    private static final Map<String, Object> TOOLS;

    static {
        Map<String, Object> root;
        try (InputStream in = AgentSchemas.class.getResourceAsStream("/agent-schemas.json")) {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode node = mapper.readTree(in);
            root = (Map<String, Object>) cn.iqilun.common.JdbcJson.convert(node);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        ROOT = root;
        @SuppressWarnings("unchecked")
        Map<String, Object> tools = (Map<String, Object>) root.get("tools");
        TOOLS = tools;
    }

    private AgentSchemas() {}

    public static Object toolSchema(String tool) { return TOOLS.get(tool); }

    public static Object outputSchema(String taskType) {
        return "agent_ping".equals(taskType) ? ROOT.get("ping") : ROOT.get("aiOutput");
    }
}
