package cn.iqilun.common;

/**
 * Rewrites PostgreSQL-style $N placeholders to JDBC '?', skipping single-quoted
 * string literals (with '' escaping). This lets R2 port the legacy SQL strings
 * verbatim instead of retyping every placeholder.
 */
final class Placeholders {
    private Placeholders() {}

    static String toJdbc(String sql) {
        StringBuilder out = new StringBuilder(sql.length());
        boolean inString = false;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'') {
                inString = !inString;
                out.append(c);
            } else if (!inString && c == '$' && i + 1 < sql.length() && Character.isDigit(sql.charAt(i + 1))) {
                while (i + 1 < sql.length() && Character.isDigit(sql.charAt(i + 1))) i++;
                out.append('?');
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }
}
