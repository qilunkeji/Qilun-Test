package cn.iqilun.common;

import java.util.UUID;

/** JDBC value normalization so JSON serialization matches the legacy driver's shapes. */
final class JdbcValues {
    private JdbcValues() {}

    static Object normalize(Object value) {
        if (value instanceof UUID || value instanceof java.math.BigDecimal) return value.toString();
        return value;
    }
}
