package cn.iqilun.engine;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

/**
 * Port of gh-rounding.ts halfUp: decimal HALF_UP at explicit source rounding
 * points, including negative ties, using exact decimal conversion of the
 * double's shortest representation (mirrors the TS BigInt pipeline).
 */
public final class HalfUp {
    private HalfUp() {}

    public static double halfUp(double value, int places) {
        if (!Double.isFinite(value) || places < 0 || places > 6) throw new IllegalArgumentException("INVALID_ROUND_INPUT");
        // Double.toString gives the shortest round-trip decimal; TS uses toString() the same way
        BigDecimal bd = new BigDecimal(Double.toString(Math.abs(value)));
        int exponent = bd.scale() <= 0 ? bd.scale() : -bd.scale(); // scale>0 means negative power
        // value = unscaled * 10^-scale
        BigInteger digits = bd.unscaledValue();
        int scale = bd.scale();
        // power = places + exponent - fraction.length  (TS semantics on the decimal string)
        int power = places - scale;
        BigInteger units;
        if (power >= 0) {
            units = digits.multiply(BigInteger.TEN.pow(power));
        } else {
            BigInteger divisor = BigInteger.TEN.pow(-power);
            BigInteger[] qr = digits.add(divisor.divide(BigInteger.TWO)).divideAndRemainder(divisor);
            // integer division truncates toward zero; digits+div/2 is never negative here
            units = qr[0];
        }
        double out = units.doubleValue() / Math.pow(10, places);
        return value < 0 ? -out : out;
    }

    public static double halfUp(double value) { return halfUp(value, 0); }
}
