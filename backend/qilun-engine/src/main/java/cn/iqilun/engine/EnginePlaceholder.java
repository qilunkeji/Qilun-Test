package cn.iqilun.engine;

/**
 * R3 lands here: the Java port of packages/assessment-engine, accepted only
 * when the R0 golden corpus (tools/golden, chain head recorded in manifest.json)
 * reproduces bit-exactly.
 */
public final class EnginePlaceholder {
    private EnginePlaceholder() {}

    public static String status() {
        return "engine rewrite lands in R3; golden corpus gate: tools/golden/manifest.json";
    }
}
