package cn.iqilun.common;

import java.util.ArrayList;
import java.util.List;

/**
 * PostgreSQL-style $N placeholders, where N may repeat (the legacy driver
 * reuses a parameter by name). JDBC '?' binds positionally, so the translation
 * also returns which $N each '?' refers to — PgDb binds params[N-1] per hole.
 */
final class Placeholders {
    private Placeholders() {}

    record Translated(String jdbc, int[] paramIndex) {}

    static Translated toJdbc(String sql) {
        StringBuilder out = new StringBuilder(sql.length());
        List<Integer> index = new ArrayList<>();
        boolean inString = false;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'') {
                inString = !inString;
                out.append(c);
            } else if (!inString && c == '$' && i + 1 < sql.length() && Character.isDigit(sql.charAt(i + 1))) {
                int n = 0;
                while (i + 1 < sql.length() && Character.isDigit(sql.charAt(i + 1))) {
                    i++;
                    n = n * 10 + (sql.charAt(i) - '0');
                }
                out.append('?');
                index.add(n);
            } else {
                out.append(c);
            }
        }
        int[] paramIndex = new int[index.size()];
        for (int i = 0; i < paramIndex.length; i++) paramIndex[i] = index.get(i);
        return new Translated(out.toString(), paramIndex);
    }
}
