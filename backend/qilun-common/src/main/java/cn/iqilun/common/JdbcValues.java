package cn.iqilun.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** JDBC value normalization so JSON serialization matches the legacy driver's shapes. */
final class JdbcValues {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JdbcValues() {}

    static Object normalize(Object value) {
        if (value instanceof java.util.UUID || value instanceof java.math.BigDecimal) return value.toString();
        if (value instanceof java.sql.Timestamp ts) return ts.toInstant().toString();
        if (value instanceof java.sql.Date d) return d.toLocalDate().toString();
        if (value instanceof org.postgresql.util.PGobject pg && pg.getType() != null
            && (pg.getType().equals("json") || pg.getType().equals("jsonb"))) {
            try {
                JsonNode node = MAPPER.readTree(pg.getValue());
                return cn.iqilun.common.JdbcJson.convert(node);
            } catch (Exception e) {
                return pg.getValue();
            }
        }
        return value;
    }
}
