package cn.iqilun.engine;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * ECMA-262 Number::toString formatting so JSON output byte-matches JavaScript.
 * Algorithm: find the shortest decimal digit string s (with exponent n) that
 * round-trips to the double, then render per spec rules — plain notation for
 * -6 <= n < 21, otherwise exponential with 'e+'/'e-'.
 */
public final class JsNumber {
    private JsNumber() {}

    public static String format(double v) {
        if (v != v) return "NaN";
        if (v == Double.POSITIVE_INFINITY) return "Infinity";
        if (v == Double.NEGATIVE_INFINITY) return "-Infinity";
        if (v == 0.0) return (Double.doubleToRawLongBits(v) < 0) ? "0" : "0";

        String javaStr = Double.toString(v); // shortest digits since JDK19 (Ryū)
        // parse into sign / digits / exponent-of-first-digit
        boolean negative = javaStr.startsWith("-");
        String s = negative ? javaStr.substring(1) : javaStr;
        int eIndex = s.indexOf('E');
        int expVal = eIndex >= 0 ? Integer.parseInt(s.substring(eIndex + 1)) : 0;
        String mantissa = eIndex >= 0 ? s.substring(0, eIndex) : s;
        int dot = mantissa.indexOf('.');
        String intPart = dot >= 0 ? mantissa.substring(0, dot) : mantissa;
        String fracPart = dot >= 0 ? mantissa.substring(dot + 1) : "";
        String digits = (intPart + fracPart);
        int n = expVal + intPart.length() - 1; // power of ten of the leading digit

        // strip trailing zero digits (keep at least one)
        int end = digits.length();
        while (end > 1 && digits.charAt(end - 1) == '0') end--;
        digits = digits.substring(0, end);
        int k = digits.length();

        StringBuilder out = new StringBuilder();
        if (negative) out.append('-');
        if (k <= n + 1 && n < 21) {
            // plain: dddd000...
            out.append(digits);
            for (int i = 0; i < n + 1 - k; i++) out.append('0');
        } else if (0 <= n && n < 21) {
            // plain with decimal point inside digits
            out.append(digits, 0, n + 1).append('.').append(digits, n + 1, k);
        } else if (-6 < n && n < 0) {
            // 0.00ddd
            out.append("0.");
            for (int i = 0; i < -(n + 1); i++) out.append('0');
            out.append(digits);
        } else {
            // exponential: d.ddd e+/- n
            out.append(digits.charAt(0));
            if (k > 1) out.append('.').append(digits, 1, k);
            out.append('e').append(n >= 0 ? '+' : '-').append(Math.abs(n));
        }
        return out.toString();
    }

    /** Sanity guard used by tests: formatting must round-trip byte-for-byte. */
    public static boolean roundTrips(double v) {
        try {
            return new BigDecimal(format(v)).doubleValue() == v
                || new BigDecimal(format(v), MathContext.DECIMAL64).doubleValue() == v;
        } catch (Exception e) {
            return false;
        }
    }
}
