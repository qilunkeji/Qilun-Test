package cn.iqilun.engine;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * JSON serializer with JavaScript JSON.stringify semantics: LinkedHashMap
 * insertion order, raw UTF-8 non-ASCII, JS-style control-char escapes, and
 * ECMA-262 Number::toString formatting (integral doubles without ".0",
 * exponential switch at 1e21 / 1e-6). Golden-vector sha256 parity depends on
 * byte-exact output of this class.
 */
public final class JsJson {
    private JsJson() {}

    public static String stringify(Object value) {
        StringBuilder sb = new StringBuilder(1 << 16);
        write(sb, value);
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object value) {
        if (value == null) { sb.append("null"); return; }
        if (value instanceof String s) { writeString(sb, s); return; }
        if (value instanceof Boolean b) { sb.append(b ? "true" : "false"); return; }
        if (value instanceof Double d) { sb.append(JsNumber.format(d)); return; }
        if (value instanceof Float f) { sb.append(JsNumber.format(f.doubleValue())); return; }
        if (value instanceof Number n) { sb.append(JsNumber.format(n.doubleValue())); return; }
        if (value instanceof Map<?, ?> map) {
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : map.entrySet()) {
                if (!first) sb.append(',');
                first = false;
                writeString(sb, String.valueOf(e.getKey()));
                sb.append(':');
                write(sb, e.getValue());
            }
            sb.append('}');
            return;
        }
        if (value instanceof Iterable<?> it) {
            sb.append('[');
            boolean first = true;
            for (Object item : it) {
                if (!first) sb.append(',');
                first = false;
                write(sb, item);
            }
            sb.append(']');
            return;
        }
        if (value instanceof Object[] arr) {
            write(sb, List.of(arr));
            return;
        }
        throw new IllegalArgumentException("unsupported json value: " + value.getClass());
    }

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        sb.append('"');
    }

    // --- small helpers used while assembling TS-shaped objects ----------------
    public static Map<String, Object> obj(Object... kv) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            if (kv[i + 1] == null && kv[i] == null) throw new IllegalArgumentException("bad kv");
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    public static List<Object> arr(Object... items) {
        List<Object> l = new ArrayList<>(items.length);
        for (Object item : items) l.add(item);
        return l;
    }

    public static double d(Object value) { return ((Number) value).doubleValue(); }
}
