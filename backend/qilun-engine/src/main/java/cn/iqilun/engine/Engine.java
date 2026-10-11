package cn.iqilun.engine;

import static cn.iqilun.engine.Catalog.listOf;
import static cn.iqilun.engine.Catalog.mapOf;
import static cn.iqilun.engine.Catalog.num;
import static cn.iqilun.engine.Catalog.lint;
import static cn.iqilun.engine.Catalog.str;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Java port of packages/assessment-engine (qilun standard invite path),
 * function-by-function against the TS source. Every object is a LinkedHashMap
 * built in TS insertion order; sums loop in TS order; rounding happens only at
 * the TS rounding points. Acceptance: the R0 golden corpus must reproduce
 * byte-exactly (GoldenVectorTest).
 */
public final class Engine {

    public static final String GH_EVIDENCE_VERSION = "gh-server-evidence-20260930-v1";
    public static final String GH_REPLAY_VERSION = "gh-report-replay-v22";
    public static final String GH_INFERENCE_VERSION = "qilun-gh-inverse-v1";
    public static final String QILUN_STANDARD_VERSION = "qilun-internal-assessment/1.0.0";
    public static final String REPLAY_PURPOSE = "evidence_verification_only";

    private static final String[] B_NAMES = {"推行力", "管控力", "创造力", "决断力", "凝聚力", "服务力", "培育力", "感召力"};
    private static final String[][] B_GROUPS_ARR = {
        {"推行力", "责任", "专注", "成就", "排难", "信仰"},
        {"管控力", "纪律", "统筹", "公平", "审慎"},
        {"创造力", "理念", "前瞻", "搜集", "学习"},
        {"决断力", "战略", "分析", "思维", "回顾"},
        {"凝聚力", "关联", "和谐", "交往", "个别", "伯乐"},
        {"服务力", "包容", "体谅", "积极", "适应"},
        {"培育力", "完美", "追求", "沟通", "取悦"},
        {"感召力", "统率", "自信", "竞争", "行动"},
    };
    private static final double[] STRENGTH_WEIGHTS = {10, 9.5, 9, 8.5, 8, 7.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1.05, .95, .9, .85, .8, .75, .7, .65, .6, .55, .45, .4, .35, .3, .25, .2, .15, .1};
    private static final String[] ROLE_KEYS = {"IFP", "EFJ", "INJ", "ENP", "ITP", "ETJ", "ISJ", "ESP"};
    private static final String[][] ROLE_LETTERS = {
        {"I", "F", "P"}, {"E", "F", "J"}, {"I", "N", "J"}, {"E", "N", "P"},
        {"I", "T", "P"}, {"E", "T", "J"}, {"I", "S", "J"}, {"E", "S", "P"},
    };
    private static final double[][] ROLE_WEIGHTS = {
        {.2, .5, .3}, {.3, .5, .2}, {.3, .5, .2}, {.2, .5, .3},
        {.3, .5, .2}, {.2, .5, .3}, {.2, .5, .3}, {.3, .5, .2},
    };
    private static final Map<String, List<String>> P5 = Map.of(
        "cxl", List.of("157", "170", "161", "167"),
        "fxl", List.of("164", "158", "159", "161"),
        "yzl", List.of("162", "165", "166", "169", "175", "151"),
        "xzl", List.of("168", "173", "160", "176", "174"),
        "jll", List.of("154", "162", "175", "163", "177"));
    private static final Map<String, List<String>> PMS = Map.of(
        "gzw", List.of("14", "15", "16", "17", "18", "19", "20", "23", "26", "27"),
        "gtr", List.of("1", "2", "3", "4", "5", "6", "7", "22"),
        "grw", List.of("8", "9", "10", "11", "12", "13", "21", "24", "25", "28"));

    private final Catalog c;
    private final List<Map<String, Object>> cfgItems;
    private final List<Map<String, Object>> serverItems;
    private final List<Map<String, Object>> serverQuestions;
    private final List<Map<String, Object>> serverValues;
    private final Map<String, Object> traitMap;
    private final Map<String, Object> roleMap;
    /** sha256(JSON.stringify(rulebook)) — same computation as the TS runtime's rules_fingerprint. */
    public final String rulesFingerprint;

    public Engine(Catalog catalog) {
        this.c = catalog;
        this.cfgItems = listOf(c.derivedCfg.get("items"));
        this.serverItems = listOf(c.serverRules.get("items"));
        this.serverQuestions = listOf(c.serverRules.get("questions"));
        this.serverValues = listOf(c.serverRules.get("values"));
        this.traitMap = mapOf(c.derivedCfg.get("trait_map"));
        this.roleMap = mapOf(c.derivedCfg.get("role_map"));
        this.rulesFingerprint = sha256Hex(JsJson.stringify(c.rulebook));
    }

    static String sha256Hex(String text) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            StringBuilder sb = new StringBuilder(64);
            for (byte b : md.digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8))) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String enameOfItem(long id) {
        for (Map<String, Object> i : cfgItems) if (lint(i.get("id")) == id) return str(i.get("ename"));
        throw new IllegalStateException("cfg item missing " + id);
    }

    static Map<String, Object> obj() { return new LinkedHashMap<>(); }
    static double sumD(List<Double> a) { double t = 0; for (double v : a) t += v; return t; }
    static double sumRows(List<Map<String, Object>> rows, String key) { double t = 0; for (Map<String, Object> r : rows) t += num(r.get(key)); return t; }
    static double round3(double n) { return HalfUp.halfUp(n, 3); }
    static Map<String, Object> copy(Map<String, Object> src) { return new LinkedHashMap<>(src); }

    private List<Map<String, Object>> cfgType(double type, boolean excludeParentZero) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> i : cfgItems) {
            if (num(i.get("type")) != type) continue;
            if (excludeParentZero && lint(i.get("parent")) == 0) continue;
            out.add(i);
        }
        return out;
    }

    private static final Comparator<Map<String, Object>> BY_ITEM_ID = Comparator.comparingLong(m -> lint(m.get("item")));
    private static final Comparator<Map<String, Object>> BY_CFG_ID = Comparator.comparingLong(m -> lint(m.get("id")));

    private List<Map<String, Object>> cfgSorted(List<Map<String, Object>> in, Comparator<Map<String, Object>> cmp) {
        List<Map<String, Object>> out = new ArrayList<>(in);
        out.sort(cmp);
        return out;
    }

    // =====================================================================
    // first layer: gh-server-evidence.ts scoreGhFirstLayer
    // =====================================================================
    public Map<String, Object> scoreGhFirstLayer(Map<String, Integer> answers, List<Map<String, Object>> values) {
        Set<String> questionIds = new HashSet<>();
        for (Map<String, Object> q : serverQuestions) questionIds.add(str(q.get("id")));
        if (answers.size() != 277 || !questionIds.containsAll(answers.keySet()))
            throw new IllegalArgumentException("必须提交本版本全部277题，不能混入外部180题或未知题号。");
        Set<String> valueIds = new HashSet<>();
        for (Map<String, Object> v : serverValues) valueIds.add(str(v.get("id")));
        Set<Long> ranks = new HashSet<>();
        Set<String> vIds = new HashSet<>();
        for (Map<String, Object> v : values) { ranks.add(lint(v.get("rank"))); vIds.add(str(v.get("id"))); }
        if (vIds.size() != 10 || ranks.size() != 10 || !valueIds.containsAll(vIds))
            throw new IllegalArgumentException("价值观需10个不同的有效题号，名次1–10不得重复。");

        Map<String, Long> totals = new HashMap<>(), counts = new HashMap<>();
        Map<String, Object> coefficients = mapOf(c.serverRules.get("type3_multipliers_hundredths"));
        List<Double> rankPoints = new ArrayList<>();
        for (Object p : (List<?>) c.serverRules.get("rank_points")) rankPoints.add(num(p));

        List<Map<String, Object>> contributions = new ArrayList<>();
        for (Map<String, Object> q : serverQuestions) {
            int choice = answers.get(str(q.get("id")));
            List<Double> scores = new ArrayList<>();
            for (Object s : (List<?>) ((List<?>) q.get("scores")).get(choice - 1)) scores.add(num(s));
            List<Map<String, Object>> parts = new ArrayList<>();
            long[] pair = {lint(q.get("item")), q.get("opposite") == null ? 0 : lint(q.get("opposite"))};
            for (int i = 0; i < 2; i++) {
                long item = pair[i];
                if (item == 0) continue;
                long multiplier = num(q.get("type")) == 3
                    ? (coefficients.get(String.valueOf(item)) != null ? lint(coefficients.get(String.valueOf(item))) : 150L)
                    : 100L;
                long units = Math.round(scores.get(i) * 100) * multiplier;
                String k = fkey(num(q.get("type")), item);
                totals.merge(k, units, Long::sum);
                counts.merge(k, 1L, Long::sum);
                Map<String, Object> part = obj();
                part.put("item", item);
                part.put("base_add", scores.get(i));
                part.put("multiplier", multiplier / 100.0);
                part.put("add", units / 10000.0);
                parts.add(part);
            }
            Map<String, Object> contribution = obj();
            contribution.put("question_id", q.get("id"));
            contribution.put("type", q.get("type"));
            contribution.put("choice", (long) choice);
            contribution.put("parts", parts);
            contributions.add(contribution);
        }
        List<Map<String, Object>> valueContributions = new ArrayList<>();
        for (Map<String, Object> v : values) {
            Map<String, Object> q = null;
            for (Map<String, Object> sv : serverValues) if (str(sv.get("id")).equals(str(v.get("id")))) { q = sv; break; }
            if (q == null) throw new IllegalArgumentException("bad value id");
            double points = rankPoints.get((int) lint(v.get("rank")) - 1);
            totals.merge(fkey(5, lint(q.get("item"))), (long) (points * 10000), Long::sum);
            counts.merge(fkey(5, lint(q.get("item"))), 1L, Long::sum);
            Map<String, Object> vc = obj();
            vc.put("question_id", v.get("id"));
            vc.put("rank", v.get("rank"));
            vc.put("item", q.get("item"));
            vc.put("add", points);
            valueContributions.add(vc);
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> i : serverItems) {
            double type = num(i.get("type"));
            if (type != 2 && type != 3 && type != 4 && type != 5) continue;
            Map<String, Object> row = obj();
            row.put("type", i.get("type"));
            row.put("item", i.get("id"));
            row.put("name", i.get("name"));
            row.put("ename", i.get("ename"));
            row.put("score", totals.getOrDefault(fkey(type, lint(i.get("id"))), 0L) / 10000.0);
            row.put("contributing_questions", counts.getOrDefault(fkey(type, lint(i.get("id"))), 0L));
            rows.add(row);
        }
        rows.sort(Comparator.<Map<String, Object>>comparingLong(m -> lint(m.get("type"))).thenComparingLong(m -> lint(m.get("item"))));

        Map<String, Object> out = obj();
        out.put("version", GH_EVIDENCE_VERSION);
        out.put("kind", "gh_first_layer_evidence_trial");
        out.put("input_kind", "manual_answers");
        out.put("formal_score", false);
        out.put("exact_replica_ready", false);
        out.put("recruitment_decision_allowed", false);
        out.put("persisted_as_person_report", false);
        out.put("rows", rows);
        out.put("contributions", contributions);
        out.put("value_contributions", valueContributions);
        out.put("limitations", List.of(
            "仅为指定20260930证据版本的第一层项目分，不是百分位、完整报告或岗位适合度。",
            "277题全部必答；服务端type2/3/4分别153/60/64题，与页面模块划分不同。",
            "只核验10项价值观提交排序；未重建每次实际展示的32词分组及选择过程。",
            "未生成type16、角色校准、星级、解释文本、个人PDF或岗位匹配；原报告留白不自动填入这些基础分。",
            "不用于自动招聘排序、录用、淘汰或岗位安排；只用于规则核验与本人发展沟通。"
        ));
        return out;
    }

    private static String fkey(double type, long item) { return (long) type + ":" + item; }

    // =====================================================================
    // gh-derived.ts: calibrate / grade / style / translate
    // =====================================================================
    static double calibrateGh(double type, double score) {
        if (!Double.isFinite(score) || score < 0) throw new IllegalArgumentException("INVALID_RAW_SCORE");
        if (type != 4 && type != 5) return score;
        double avg = type == 4 ? 11.918 : 10.1749, old = type == 4 ? 20 : 28;
        double ap = avg * 100 / old, sp = score * 100 / old;
        return (score > avg ? 60 + 40 / (100 - ap) * (sp - ap) : 60 - 60 / ap * (ap - sp)) * 20 / 100;
    }

    static long gradeGh(double total) {
        if (!Double.isFinite(total) || total < 0) throw new IllegalArgumentException("INVALID_STRENGTH_TOTAL");
        return total <= 99 ? 1 : total >= 100 && total <= 151 ? 2 : total >= 152 && total <= 260 ? 3 : total >= 261 && total <= 356 ? 4 : total >= 357 ? 5 : 0;
    }

    static double translateGhRole(double x, double[] t) {
        double x0 = t[0], x1 = t[1], x2 = t[2];
        if (!Double.isFinite(x) || !(x0 > x1 && x1 > x2 && x2 > 0)) throw new IllegalArgumentException("INVALID_ROLE_CALIBRATION");
        return x >= x0 ? 100 : x >= x1 ? 20 / (x0 - x1) * (x - x1) + 80 : x >= x2 ? 60 / (x1 - x2) * (x - x2) + 20 : 20 / x2 * x;
    }

    Map<String, Object> deriveGhStyle(List<Map<String, Object>> rows) {
        Map<String, Double> byName = new HashMap<>();
        for (Map<String, Object> i : cfgType(3, false)) {
            double score = 0;
            for (Map<String, Object> r : rows) if (num(r.get("type")) == 3 && lint(r.get("item")) == lint(i.get("id"))) { score = num(r.get("score")); break; }
            byName.put(str(i.get("ename")), score);
        }
        String[][] pairsDef = {{"E", "I"}, {"S", "N"}, {"T", "F"}, {"J", "P"}};
        List<Map<String, Object>> pairs = new ArrayList<>();
        StringBuilder code = new StringBuilder();
        for (String[] p : pairsDef) {
            double left = byName.get(p[0]), right = byName.get(p[1]);
            Map<String, Object> pair = obj();
            pair.put("left", p[0]);
            pair.put("right", p[1]);
            pair.put("left_score", left);
            pair.put("right_score", right);
            pair.put("tie", left == right);
            String winner = left > right ? p[0] : p[1];
            pair.put("winner", winner);
            pairs.add(pair);
            code.append(winner);
        }
        Map<String, Object> definition = null;
        for (Map<String, Object> s : listOf(c.derivedCfg.get("styles"))) if (str(s.get("code")).equals(code.toString())) { definition = s; break; }
        if (definition == null) throw new IllegalStateException("STYLE_CONFIGURATION_MISSING");
        Map<String, Object> out = obj();
        out.put("code", code.toString());
        out.put("result_id", definition.get("id"));
        out.put("name", definition.get("name"));
        out.put("description", definition.get("description"));
        out.put("pairs", pairs);
        out.put("tie_policy", "right_side_INFP");
        return out;
    }

    // =====================================================================
    // buildInputs / strengthOrder / bRate / components / deriveGhDimensions
    // =====================================================================
    static final class Inputs {
        List<Map<String, Object>> notion, d, c8, bOrdered, bnew;
    }

    private List<Map<String, Object>> joined(List<Map<String, Object>> rows, double type) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> i : cfgItems) {
            if (num(i.get("type")) != type) continue;
            if (type == 2 && lint(i.get("parent")) == 0) continue;
            double score = 0;
            for (Map<String, Object> r : rows) if (num(r.get("type")) == type && lint(r.get("item")) == lint(i.get("id"))) { score = num(r.get("score")); break; }
            Map<String, Object> w = obj();
            w.put("item", i.get("id"));
            w.put("name", i.get("name"));
            w.put("ename", i.get("ename"));
            w.put("parent", i.get("parent"));
            w.put("score", score);
            w.put("value", 0.0);
            w.put("total", 0.0);
            out.add(w);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    Inputs buildInputs(List<Map<String, Object>> rows) {
        List<Map<String, Object>> notion = joined(rows, 5);
        notion.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("score"))).thenComparingLong(m -> lint(m.get("item"))));
        List<Map<String, Object>> d = joined(rows, 4);
        d.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("score"))).thenComparing(m -> str(m.get("ename"))));
        for (List<Map<String, Object>> group : List.of(notion, d)) {
            for (Map<String, Object> r : group) if (num(r.get("score")) == 0) r.put("score", 0.5);
            double total = sumRows(group, "score");
            for (Map<String, Object> r : group) { r.put("total", total); r.put("value", num(r.get("score")) / total * 100); }
        }
        normalized(notion, constantWeights(8, 12.5), true);
        normalized(d, new double[]{20, 18, 16, 14, 12, 9, 6, 5}, false);
        List<Map<String, Object>> cItems = joined(rows, 3);
        Map<String, Double> percent = new HashMap<>();
        String[][] pairsDef = {{"E", "I"}, {"S", "N"}, {"T", "F"}, {"J", "P"}};
        for (String[] p : pairsDef) {
            double left = findScore(cItems, p[0]), right = findScore(cItems, p[1]), total = left + right;
            percent.put(p[0], total != 0 ? left / total * 100 : 0.0);
            percent.put(p[1], total != 0 ? right / total * 100 : 0.0);
        }
        List<Map<String, Object>> c8 = new ArrayList<>();
        List<Map<String, Object>> type28 = new ArrayList<>(cfgType(28, false));
        type28.sort(Comparator.comparingLong(m -> lint(m.get("id"))));
        for (Map<String, Object> i : type28) {
            int expr = exprIndex(str(i.get("ename")));
            String[] letters = ROLE_LETTERS[expr];
            double[] w = ROLE_WEIGHTS[expr];
            Map<String, Object> row = obj();
            row.put("item", i.get("id"));
            row.put("name", i.get("name"));
            row.put("ename", i.get("ename"));
            row.put("parent", i.get("parent"));
            row.put("score", 0.0);
            row.put("value", (w[0] * percent.get(letters[0]) + w[1] * percent.get(letters[1]) + w[2] * percent.get(letters[2])) / 4);
            row.put("total", 0.0);
            c8.add(row);
        }
        c8.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("value"))).thenComparingLong(m -> lint(m.get("item"))));
        normalized(c8, new double[]{25, 20, 15, 10, 9, 8, 7, 6}, true);
        List<Map<String, Object>> bOrdered = strengthOrder(joined(rows, 2));
        normalized(bOrdered, STRENGTH_WEIGHTS, false);
        List<Map<String, Object>> bnew = new ArrayList<>();
        for (String name : B_NAMES) {
            List<String> group = groupOf(name);
            double value = 0;
            for (Map<String, Object> r : bOrdered) if (group.contains(str(r.get("name")))) value += num(r.get("value"));
            Map<String, Object> row = obj();
            row.put("name", name);
            row.put("value", value);
            bnew.add(row);
        }
        Inputs inputs = new Inputs();
        inputs.notion = notion; inputs.d = d; inputs.c8 = c8; inputs.bOrdered = bOrdered; inputs.bnew = bnew;
        return inputs;
    }

    private static List<Map<String, Object>> items; // static mirror used by joined()

    private static double findScore(List<Map<String, Object>> list, String ename) {
        for (Map<String, Object> x : list) if (ename.equals(str(x.get("ename")))) return num(x.get("score"));
        throw new IllegalStateException("missing " + ename);
    }

    private static List<String> groupOf(String name) {
        for (String[] g : B_GROUPS_ARR) if (g[0].equals(name)) return List.of(java.util.Arrays.copyOfRange(g, 1, g.length));
        return List.of();
    }

    private static int exprIndex(String ename) {
        for (int i = 0; i < ROLE_KEYS.length; i++) if (ROLE_KEYS[i].equals(ename)) return i;
        throw new IllegalStateException("role expr missing " + ename);
    }

    static double[] constantWeights(int n, double v) {
        double[] out = new double[n];
        java.util.Arrays.fill(out, v);
        return out;
    }

    static void normalized(List<Map<String, Object>> rows, double[] weights, boolean fromValue) {
        if (rows.size() != weights.length) throw new IllegalStateException("RULE_DIMENSION_MISMATCH");
        double[] values = new double[rows.size()];
        for (int i = 0; i < rows.size(); i++) values[i] = (fromValue ? num(rows.get(i).get("value")) : num(rows.get(i).get("score"))) * weights[i] / 100;
        double total = sumD(java.util.Arrays.stream(values).boxed().toList());
        for (int i = 0; i < rows.size(); i++) rows.get(i).put("value", total != 0 ? values[i] / total * 100 : 0.0);
    }

    private List<Map<String, Object>> strengthOrder(List<Map<String, Object>> rows) {
        List<Map<String, Object>> ordered = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> copy = copy(r);
            copy.put("category", categoryOf(str(r.get("name"))));
            ordered.add(copy);
        }
        ordered.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("score"))).thenComparingLong(m -> lint(m.get("item"))));
        List<Map<String, Object>> cats = new ArrayList<>();
        for (String name : B_NAMES) {
            List<Map<String, Object>> members = filterCategory(ordered, name);
            double value = sumRows(members, "score");
            double max = 0;
            for (Map<String, Object> m : members) max = Math.max(max, num(m.get("score")));
            Map<String, Object> cat = obj();
            cat.put("name", name);
            cat.put("value", value);
            cat.put("score", Math.max(0, max));
            cat.put("ranking", 0L);
            cat.put("parent", parentGroupOf(name));
            cats.add(cat);
        }
        List<Map<String, Object>> groups = new ArrayList<>();
        for (String name : List.of("执行", "思维", "关系", "影响")) {
            double value = 0;
            for (Map<String, Object> cat : cats) if (name.equals(str(cat.get("parent")))) value += num(cat.get("value"));
            Map<String, Object> g = obj();
            g.put("name", name);
            g.put("value", value);
            g.put("ranking", 0L);
            groups.add(g);
        }
        groups.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("value"))));
        for (int i = 0; i < groups.size(); i++)
            groups.get(i).put("ranking", (long) (i > 0 && num(groups.get(i).get("value")) == num(groups.get(i - 1).get("value")) ? num(groups.get(i - 1).get("ranking")) : i + 1));
        cats.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("score"))));
        for (int i = 0; i < cats.size(); i++)
            cats.get(i).put("ranking", (long) (i > 0 && num(cats.get(i).get("score")) == num(cats.get(i - 1).get("score")) ? num(cats.get(i - 1).get("ranking")) : i + 1));
        for (Map<String, Object> cat : cats) {
            long groupRanking = (long) num(groupByName(groups, str(cat.get("parent"))).get("ranking"));
            cat.put("value", (long) num(cat.get("value")) * 100 + (5 - groupRanking) * 10 + 9 - num(cat.get("ranking")));
        }
        cats.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("value"))));
        for (Map<String, Object> r : ordered) {
            int catIndex = catIndexByName(cats, str(r.get("category")));
            r.put("value", (long) num(r.get("score")) * 10 + 8 - catIndex);
        }
        ordered.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("value"))).thenComparingLong(m -> lint(m.get("item"))));
        return ordered;
    }

    private static String categoryOf(String name) {
        for (String[] g : B_GROUPS_ARR) for (int i = 1; i < g.length; i++) if (g[i].equals(name)) return g[0];
        return "";
    }

    private static final Map<String, List<String>> PARENT_GROUPS = Map.of(
        "执行", List.of("管控力", "推行力"),
        "思维", List.of("创造力", "决断力"),
        "关系", List.of("凝聚力", "服务力"),
        "影响", List.of("培育力", "感召力"));

    private static String parentGroupOf(String name) {
        for (Map.Entry<String, List<String>> e : PARENT_GROUPS.entrySet()) if (e.getValue().contains(name)) return e.getKey();
        return null;
    }

    private static List<Map<String, Object>> filterCategory(List<Map<String, Object>> rows, String category) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) if (category.equals(str(r.get("category")))) out.add(r);
        return out;
    }

    private static Map<String, Object> groupByName(List<Map<String, Object>> groups, String name) {
        for (Map<String, Object> g : groups) if (name.equals(str(g.get("name")))) return g;
        throw new IllegalStateException("group missing");
    }

    private static int catIndexByName(List<Map<String, Object>> cats, String name) {
        for (int i = 0; i < cats.size(); i++) if (name.equals(str(cats.get(i).get("name")))) return i;
        return -1;
    }

    // bRate ------------------------------------------------------------------
    private static double weight(Map<String, Object> row, String name) {
        List<Object> levels = (List<Object>) row.get("levels");
        int i = levels.indexOf(name);
        if (i < 0) return 1;
        Object score = ((List<Object>) row.get("scores")).get(i);
        return score == null ? 1 : num(score);
    }

    private static double bRate(Map<String, Object> r, List<Map<String, Object>> ordered) {
        List<Object> levels = (List<Object>) r.get("levels");
        String k1 = str(levels.get(0)), k2 = str(levels.get(1));
        String k3 = levels.size() > 2 && levels.get(2) != null ? str(levels.get(2)) : k1;
        String k4 = levels.size() > 3 && levels.get(3) != null ? str(levels.get(3)) : k2;
        List<Map<String, Object>> top6 = ordered.subList(0, Math.min(6, ordered.size()));
        List<Map<String, Object>> last3 = ordered.subList(Math.max(0, ordered.size() - 3), ordered.size());
        long ta = count(top6, k1), tb = count(top6, k2), la = count(last3, k3), lb = count(last3, k4);
        if ("combination".equals(str(r.get("action")))) {
            List<Object> scores = (List<Object>) r.get("scores");
            int idx = ta >= 1 && la >= 1 && la <= 3 ? (int) la - 1 : 3;
            Object v = idx < scores.size() ? scores.get(idx) : null;
            return v == null ? 1 : num(v);
        }
        Map<String, Object> ext = (Map<String, Object>) r.get("ext");
        return ta != 0 && la != 0 ? extValue(ext, "T" + ta + "A") * extValue(ext, "L" + la + "A")
             : ta != 0 ? extValue(ext, "T" + ta + "A")
             : la != 0 ? extValue(ext, "L" + la + "A")
             : tb != 0 && lb != 0 ? extValue(ext, "T" + tb + "B") * extValue(ext, "L" + lb + "B")
             : tb != 0 ? extValue(ext, "T" + tb + "B")
             : lb != 0 ? extValue(ext, "L" + lb + "B")
             : 1;
    }

    private static double extValue(Map<String, Object> ext, String k) {
        Object v = ext == null ? null : ext.get(k);
        return v == null ? 1 : num(v);
    }

    private static long count(List<Map<String, Object>> slice, String names) {
        long out = 0;
        for (Map<String, Object> x : slice) if (names != null && names.contains(str(x.get("name")))) out++;
        return out;
    }

    // components -------------------------------------------------------------
    static final class Comps {
        double b, cc, d, notion;
        boolean configured;
    }

    private Comps components(String key, Map<String, Object> mp, Inputs inp, String cTop) {
        Comps out = new Comps();
        if (mp.get(key + "-total-rate") == null) return out;
        double totalD = num(inp.d.get(0).get("total"));
        List<Object> dr = (List<Object>) mapOf(mp.get(key + "-d-rate")).get("scores");
        double rateD = num(dr.get(totalD > 105 ? 3 : totalD > 72 ? 2 : totalD > 50 ? 1 : 0));
        int charCount = 0;
        if (cTop != null) for (char ch : cTop.toCharArray()) if (key.indexOf(ch) >= 0) charCount++;
        out.b = round3(weightedValue(inp.bnew, mapOf(mp.get(key + "-b")), false) * bRate(mapOf(mp.get(key + "-b-rate")), inp.bOrdered));
        out.cc = round3(weightedValue(inp.c8, mapOf(mp.get(key + "-c8")), true));
        out.d = round3(weightedValue(inp.d, mapOf(mp.get(key + "-d")), false) * rateD);
        double notionFactor = 1;
        if (cTop != null) {
            List<Object> scores = (List<Object>) mapOf(mp.get(key + "-notion-rate")).get("scores");
            notionFactor = num(scores.get(Math.min(charCount, 3)));
        }
        out.notion = round3(weightedValue(inp.notion, mapOf(mp.get(key + "-notion")), true) * notionFactor);
        out.configured = true;
        return out;
    }

    private static double weightedValue(List<Map<String, Object>> list, Map<String, Object> row, boolean byCode) {
        double sum = 0;
        for (Map<String, Object> r : list) sum += num(r.get("value")) * weight(row, byCode ? str(r.get("ename")) : str(r.get("name"))) / 100;
        return sum;
    }

    // =====================================================================
    // deriveGhDimensions
    // =====================================================================
    public Map<String, Object> deriveGhDimensions(List<Map<String, Object>> rows) {
        Inputs inp = buildInputs(rows);
        Map<String, Object> style = deriveGhStyle(rows);

        List<Map<String, Object>> children = new ArrayList<>();
        List<Map<String, Object>> type16Children = cfgSorted(cfgType(16, true), BY_CFG_ID);
        for (Map<String, Object> i : type16Children) {
            Comps cc = components(String.valueOf(lint(i.get("id"))), traitMap, inp, null);
            Map<String, Object> totalRate = mapOf(traitMap.get(lint(i.get("id")) + "-total-rate"));
            List<Object> t = totalRate == null ? null : (List<Object>) totalRate.get("scores");
            double score = t != null ? HalfUp.halfUp(Math.min(30, (cc.cc * num(t.get(0)) + cc.b * num(t.get(1)) + cc.d * num(t.get(2)) + cc.notion * num(t.get(3))) / 100)) : 0;
            Map<String, Object> child = obj();
            child.put("item", i.get("id"));
            child.put("parent", i.get("parent"));
            child.put("name", i.get("name"));
            child.put("score", score);
            child.put("b", cc.b);
            child.put("c", cc.cc);
            child.put("d", cc.d);
            child.put("notion", cc.notion);
            child.put("configured", cc.configured);
            children.add(child);
        }
        double totalTraits = sumRows(children, "score");
        List<Map<String, Object>> parents = new ArrayList<>();
        for (Map<String, Object> i : cfgSorted(cfgType(16, false), BY_CFG_ID)) {
            if (lint(i.get("parent")) != 0) continue;
            double sum = 0;
            for (Map<String, Object> ch : children) if (lint(ch.get("parent")) == lint(i.get("id"))) sum += num(ch.get("score"));
            Map<String, Object> parent = obj();
            parent.put("item", i.get("id"));
            parent.put("name", i.get("name"));
            parent.put("score", totalTraits != 0 ? (Object) HalfUp.halfUp(sum / totalTraits * 100, 2) : null);
            parents.add(parent);
        }
        double totalB = 0;
        for (Map<String, Object> r : rows) if (num(r.get("type")) == 2) totalB += num(r.get("score"));
        double totalC = 0;
        for (Object p : (List<?>) style.get("pairs")) {
            Map<String, Object> pair = mapOf(p);
            totalC += Math.abs(num(pair.get("left_score")) - num(pair.get("right_score")));
        }
        long regionB = totalB < 152 ? 1 : totalB < 261 ? 2 : totalB < 357 ? 3 : 4;
        long regionC = totalC < 16.5 ? 1 : totalC < 28.7 ? 2 : totalC < 40.5 ? 3 : 4;
        double baseC = 40, baseB = 30;
        if (regionC > regionB) { baseC = Math.min(50, baseC + (regionC - regionB) * 5); baseB = 70 - baseC; }
        if (regionB > regionC) { baseB = Math.min(50, baseB + (regionB - regionC) * 5); baseC = 70 - baseB; }
        List<Map<String, Object>> roleStandards = listOf(c.derivedCfg.get("role_standards"));
        List<Map<String, Object>> roles = new ArrayList<>();
        for (Map<String, Object> i : cfgSorted(cfgType(28, false), BY_CFG_ID)) {
            Comps cc = components(str(i.get("ename")), roleMap, inp, str(style.get("code")));
            List<Object> t = (List<Object>) mapOf(roleMap.get(str(i.get("ename")) + "-total-rate")).get("scores");
            double total = (cc.cc * baseC + cc.b * baseB + cc.d * num(t.get(2)) + cc.notion * num(t.get(3))) / 100;
            Map<String, Object> s = null;
            for (Map<String, Object> std : roleStandards) if (lint(std.get("itemId")) == lint(i.get("id"))) { s = std; break; }
            if (s == null) throw new IllegalStateException("role standard missing");
            Map<String, Object> role = obj();
            role.put("item", i.get("id"));
            role.put("name", i.get("name"));
            role.put("ename", i.get("ename"));
            role.put("scoreB", cc.b);
            role.put("scoreC", cc.cc);
            role.put("scoreD", cc.d);
            role.put("scoreNotion", cc.notion);
            role.put("scoreTotal", total);
            role.put("scoreTotalCalibrateJunior", translateGhRole(cc.cc * .7 + cc.d * .3, new double[]{num(s.get("middleX0")), num(s.get("middleX1")), num(s.get("middleX2"))}));
            role.put("scoreTotalCalibrateSeniorNew", translateGhRole(total, new double[]{num(s.get("seniorX0")), num(s.get("seniorX1")), num(s.get("seniorX2"))}));
            roles.add(role);
        }
        List<Object> zeroRuleIds = new ArrayList<>();
        for (Map<String, Object> ch : children) if (!Boolean.TRUE.equals(ch.get("configured"))) zeroRuleIds.add(ch.get("item"));
        List<Map<String, Object>> strengths = new ArrayList<>();
        for (int i = 0; i < inp.bOrdered.size(); i++) {
            Map<String, Object> r = inp.bOrdered.get(i);
            Map<String, Object> s = obj();
            s.put("item", r.get("item"));
            s.put("name", r.get("name"));
            s.put("score", r.get("score"));
            s.put("rank", (long) (i + 1));
            s.put("weight", STRENGTH_WEIGHTS[i]);
            strengths.add(s);
        }
        Map<String, Object> traits = obj();
        traits.put("children", children);
        traits.put("parents", parents);
        traits.put("zero_rule_ids", zeroRuleIds);
        Map<String, Object> roleWeighting = obj();
        roleWeighting.put("totalB", totalB);
        roleWeighting.put("totalC", totalC);
        roleWeighting.put("regionB", (long) regionB);
        roleWeighting.put("regionC", (long) regionC);
        roleWeighting.put("baseB", baseB);
        roleWeighting.put("baseC", baseC);
        Map<String, Object> out = obj();
        out.put("style", style);
        out.put("traits", traits);
        out.put("roles", roles);
        out.put("role_weighting", roleWeighting);
        out.put("strengths", strengths);
        return out;
    }

    // =====================================================================
    // scoreGhReportReplay
    // =====================================================================
    public Map<String, Object> scoreGhReportReplay(Map<String, Object> first, List<Map<String, Object>> rowsFirst,
                                                   List<List<String>> valueFlowSelected, List<String> valueFlowRanked) {
        Map<String, Object> derived = deriveGhDimensions(rowsFirst);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> r : rowsFirst) {
            Map<String, Object> row = copy(r);
            Object calibrated = num(r.get("type")) == 5 && lint(r.get("contributing_questions")) == 0
                ? null : (Object) calibrateGh(num(r.get("type")), num(r.get("score")));
            row.put("calibrated", calibrated);
            rows.add(row);
        }
        double total = 0;
        for (Map<String, Object> r : rows) if (num(r.get("type")) == 2) total += num(r.get("score"));
        List<Map<String, Object>> valuesOut = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            if (num(r.get("type")) != 5) continue;
            Object calibrated = r.get("calibrated");
            Map<String, Object> v = obj();
            v.put("item", r.get("item"));
            v.put("name", r.get("name"));
            v.put("raw", r.get("score"));
            v.put("calibrated", calibrated);
            v.put("report_value", calibrated == null ? null : (Object) HalfUp.halfUp(Math.min(100, HalfUp.halfUp(num(calibrated), 1) * 6)));
            valuesOut.add(v);
        }
        Map<String, Object> style = mapOf(derived.get("style"));
        List<Map<String, Object>> motivation = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            if (num(r.get("type")) != 4) continue;
            Map<String, Object> m = obj();
            m.put("item", r.get("item"));
            m.put("name", r.get("name"));
            m.put("raw", r.get("score"));
            m.put("calibrated", r.get("calibrated"));
            m.put("report_value", HalfUp.halfUp(Math.min(100, num(r.get("calibrated")) * 5)));
            m.put("raw_report_value", Math.min(100, num(r.get("score")) * 5));
            motivation.add(m);
        }
        List<Map<String, Object>> motivationText = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            if (num(r.get("type")) != 4) continue;
            Map<String, Object> m = obj();
            m.put("code", enameOfItem(lint(r.get("item"))));
            m.put("raw", r.get("score"));
            motivationText.add(m);
        }
        Map<String, Object> reportText = deriveGhReportText(str(style.get("code")), motivationText, listOf(derived.get("strengths")), valuesOut, listOf(derived.get("roles")));
        Map<String, Object> grade = obj();
        grade.put("value", gradeGh(total));
        grade.put("strength_total", total);
        grade.put("evidence_grade", "SOURCE_AND_DB_COMPUTED_RUNTIME_PENDING");

        Map<String, Object> out = copy(first);
        out.put("version", GH_REPLAY_VERSION);
        out.put("kind", "gh_current_report_replay");
        out.put("rows", rows);
        out.putAll(derived);
        out.put("value_flow_verified", valueFlowSelected != null);
        out.put("grade", grade);
        out.put("motivation", motivation);
        out.put("values", valuesOut);
        out.put("report_text", reportText);
        out.put("limitations", List.of(
            "已接入当前配置的基础分、校准、风格、性格、角色和星级；完整历史复刻仍有5项缺口。",
            "性格及角色独立移植仅有一个真实完整样本回归；星级缺同次完整senior响应。",
            "278–283当前配置无规则；所示0只适用于当前配置。",
            "答案→28项能力所需AgType8Map完整配置未在包内找到；五力、管理分组仅能复算已有28项能力值。",
            "七模块短文案已按原字典与已知触发规则接线；十页长篇解释与2025历史版本全同仍未验证。",
            "答案只计算不保存，结果用于本人了解和发展沟通。"
        ));
        return out;
    }

    // =====================================================================
    // report text: gh-report-text.ts
    // =====================================================================
    private Map<String, Object> textLookup(long id) {
        for (Map<String, Object> r : listOf(c.reportTextCfg.get("results")))
            if (lint(r.get("id")) == id && (num(r.get("type")) == 4 || id == 113)) return r;
        throw new IllegalStateException("REPORT_COPY_CONFIGURATION_MISSING");
    }

    private Map<String, Object> textFind(double type, String field, String value) {
        for (Map<String, Object> r : listOf(c.reportTextCfg.get("results")))
            if (num(r.get("type")) == type && value.equals(str(r.get(field)))) return r;
        return null;
    }

    private Map<String, Object> textItem(double type, long item) {
        for (Map<String, Object> r : listOf(c.reportTextCfg.get("items")))
            if (num(r.get("type")) == type && lint(r.get("item")) == item) return r;
        throw new IllegalStateException("REPORT_ITEM_COPY_MISSING");
    }

    Map<String, Object> deriveGhMotivationText(List<Map<String, Object>> input) {
        List<Map<String, Object>> rows = new ArrayList<>(input);
        rows.sort(Comparator.comparingLong(m -> Long.parseLong(str(m.get("code")))));
        double groupA = 0, groupB = 0;
        for (Map<String, Object> r : rows) {
            String code = str(r.get("code"));
            if (List.of("1", "4", "5", "8").contains(code)) groupA += num(r.get("raw"));
            if (List.of("2", "3", "6", "7").contains(code)) groupB += num(r.get("raw"));
        }
        double diff = groupB - groupA, energy = groupA + groupB;
        Map<String, Object> max = rows.get(0), min = rows.get(0);
        for (Map<String, Object> r : rows) { if (num(r.get("raw")) > num(max.get("raw"))) max = r; if (num(r.get("raw")) < num(min.get("raw"))) min = r; }
        String pair = str(max.get("code")) + "." + str(min.get("code"));
        List<Map<String, Object>> byScore = new ArrayList<>(rows);
        byScore.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("raw"))).thenComparingLong(m -> Long.parseLong(str(m.get("code")))));
        List<String> top3Codes = new ArrayList<>();
        for (int i = 0; i < 3; i++) top3Codes.add(str(byScore.get(i).get("code")));
        top3Codes.sort(null); // lexicographic, like JS Array.prototype.sort()
        StringBuilder top3 = new StringBuilder();
        for (String s : top3Codes) top3.append(s);
        Map<String, Object> dWork = textLookup(diff < -3 ? 74 : diff <= 3 ? 75 : 76);
        Map<String, Object> dPair = textFind(4, "code", pair);
        if (dPair == null) dPair = textLookup(113);
        Map<String, Object> dThink = textLookup(energy > 105 ? 80 : energy > 72 ? 81 : energy > 50 ? 82 : 83);
        Map<String, Object> dJob = textLookup(diff < -3 ? 79 : diff <= 3 ? 78 : 77);
        Map<String, Object> d3Top = textFind(4, "code", top3.toString());
        if (d3Top == null) d3Top = textLookup(112);
        Object[][] fields = {
            {"DWork", "动机倾向", dWork, JsNumber.format(diff)},
            {"DTopAndLow", "动机类型", dPair, str(max.get("code")) + str(min.get("code"))},
            {"DThink", "思维模式", dThink, JsNumber.format(energy)},
            {"DJob", "管理偏向", dJob, JsNumber.format(diff)},
            {"D3TOP", "动机组合", d3Top, top3.toString()},
        };
        List<Map<String, Object>> lines = new ArrayList<>();
        List<Object> unmatched = new ArrayList<>();
        for (Object[] f : fields) {
            Map<String, Object> row = mapOf(f[2]);
            boolean matched = lint(row.get("id")) != 112 && lint(row.get("id")) != 113;
            Map<String, Object> line = obj();
            line.put("type", f[0]);
            line.put("label", f[1]);
            line.put("result_id", row.get("id"));
            line.put("matched", matched);
            line.put("name", row.get("name"));
            line.put("text", row.get("text"));
            line.put("value", f[3]);
            lines.add(line);
            if (!matched) unmatched.add(f[0]);
        }
        Map<String, Object> out = obj();
        out.put("version", c.reportTextCfg.get("version"));
        out.put("basis", "SOURCE_AND_DB_RULE");
        out.put("groupA", groupA);
        out.put("groupB", groupB);
        out.put("difference", diff);
        out.put("energy", energy);
        out.put("lines", lines);
        out.put("unmatched_fields", unmatched);
        out.put("missing_fields", new ArrayList<>());
        return out;
    }

    Map<String, Object> deriveGhReportText(String styleCode, List<Map<String, Object>> motivationRaw,
                                           List<Map<String, Object>> strengths, List<Map<String, Object>> values,
                                           List<Map<String, Object>> roles) {
        if (!styleCode.matches("^[EI][SN][TF][JP]$")) throw new IllegalArgumentException("INVALID_STYLE_COPY_INPUT");
        char s1 = styleCode.charAt(1), tail = styleCode.charAt(styleCode.charAt(1) == 'S' ? 3 : 2);
        String code = "" + s1 + tail;
        Map<String, Object> temperament = null;
        for (Map<String, Object> r : listOf(c.reportTextCfg.get("results")))
            if (num(r.get("type")) == 3 && code.equals(str(r.get("code")))) { temperament = r; break; }
        if (temperament == null || temperament.get("temperament_name") == null) throw new IllegalStateException("TEMPERAMENT_COPY_MISSING");
        List<Map<String, Object>> sorted = new ArrayList<>(strengths);
        sorted.sort(Comparator.comparingLong(m -> lint(m.get("rank"))));
        List<Map<String, Object>> top = new ArrayList<>();
        for (int i = 0; i < 6 && i < sorted.size(); i++) {
            Map<String, Object> s = sorted.get(i);
            Map<String, Object> item = textItem(2, lint(s.get("item")));
            Map<String, Object> row = copy(s);
            row.put("text", item.get("text"));
            row.put("parent", item.get("parent"));
            top.add(row);
        }
        List<Map<String, Object>> groups = new ArrayList<>();
        for (Map<String, Object> g : listOf(c.reportTextCfg.get("items"))) {
            if (num(g.get("type")) != 2 || lint(g.get("parent")) != 0) continue;
            List<Map<String, Object>> rowsOfGroup = new ArrayList<>();
            for (Map<String, Object> t : top) if (lint(t.get("parent")) == lint(g.get("item"))) rowsOfGroup.add(t);
            Map<String, Object> group = obj();
            group.put("item", g.get("item"));
            group.put("name", g.get("name"));
            group.put("rows", rowsOfGroup);
            groups.add(group);
        }
        List<Map<String, Object>> topValues = new ArrayList<>(values);
        topValues.removeIf(v -> v.get("calibrated") == null);
        topValues.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -HalfUp.halfUp(num(m.get("calibrated")), 1)).thenComparingLong(m -> lint(m.get("item"))));
        if (topValues.size() > 3) topValues = new ArrayList<>(topValues.subList(0, 3));
        List<Map<String, Object>> valuesOut = new ArrayList<>();
        for (Map<String, Object> v : topValues) {
            Map<String, Object> item = textItem(5, lint(v.get("item")));
            Map<String, Object> out = obj();
            out.put("item", v.get("item"));
            out.put("label", item.get("name"));
            out.put("text", item.get("text"));
            valuesOut.add(out);
        }
        List<Map<String, Object>> rolesSorted = new ArrayList<>(roles);
        rolesSorted.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("scoreTotalCalibrateSeniorNew"))).thenComparingLong(m -> lint(m.get("item"))));
        if (rolesSorted.size() > 2) rolesSorted = new ArrayList<>(rolesSorted.subList(0, 2));
        List<Map<String, Object>> rolesOut = new ArrayList<>();
        for (Map<String, Object> r : rolesSorted) {
            Map<String, Object> item = textItem(28, lint(r.get("item")));
            Map<String, Object> out = obj();
            out.put("item", r.get("item"));
            out.put("label", item.get("name"));
            out.put("text", item.get("text"));
            rolesOut.add(out);
        }
        List<Map<String, Object>> bottomSix = new ArrayList<>();
        for (int i = Math.max(0, sorted.size() - 6); i < sorted.size(); i++) {
            Map<String, Object> s = sorted.get(i);
            Map<String, Object> row = obj();
            row.put("item", s.get("item"));
            row.put("name", s.get("name"));
            row.put("rank", s.get("rank"));
            bottomSix.add(row);
        }
        // motivation input shape: {code, raw}
        List<Map<String, Object>> motivationInput = new ArrayList<>();
        for (Map<String, Object> m : motivationRaw) motivationInput.add(m);
        Map<String, Object> strengthsOut = obj();
        strengthsOut.put("groups", groups);
        strengthsOut.put("top_six", top);
        strengthsOut.put("bottom_six", bottomSix);
        Map<String, Object> out = obj();
        out.put("version", c.reportTextCfg.get("version"));
        out.put("basis", "ORIGINAL_DICTIONARY_AND_KNOWN_RULES");
        Map<String, Object> temperamentOut = obj();
        temperamentOut.put("code", code);
        temperamentOut.put("name", temperament.get("temperament_name"));
        temperamentOut.put("text", code + "（" + temperament.get("temperament_name") + "）");
        out.put("temperament", temperamentOut);
        out.put("motivation", deriveGhMotivationText(motivationInput));
        out.put("values", valuesOut);
        out.put("roles", rolesOut);
        out.put("strengths", strengthsOut);
        out.put("historical_version_equivalence_verified", false);
        return out;
    }

    // =====================================================================
    // potential groups + inference + standard + invite
    // =====================================================================
    private long cfgParentOfQuality(long item) {
        for (Map<String, Object> i : cfgItems) if (num(i.get("type")) == 8 && lint(i.get("id")) == item) return lint(i.get("parent"));
        throw new IllegalStateException("quality item missing");
    }

    Map<String, Object> deriveGhPotentialGroups(List<Map<String, Object>> rows) {
        List<Map<String, Object>> ordered = new ArrayList<>(rows);
        ordered.sort(Comparator.<Map<String, Object>>comparingLong(m -> cfgParentOfQuality(lint(m.get("item")))).thenComparingLong(m -> lint(m.get("item"))));
        java.util.LinkedHashMap<String, List<String>> p5Ordered = new java.util.LinkedHashMap<>();
        p5Ordered.put("cxl", P5.get("cxl"));
        p5Ordered.put("fxl", P5.get("fxl"));
        p5Ordered.put("yzl", P5.get("yzl"));
        p5Ordered.put("xzl", P5.get("xzl"));
        p5Ordered.put("jll", P5.get("jll"));
        java.util.LinkedHashMap<String, List<String>> pmsOrdered = new java.util.LinkedHashMap<>();
        pmsOrdered.put("gzw", PMS.get("gzw"));
        pmsOrdered.put("gtr", PMS.get("gtr"));
        pmsOrdered.put("grw", PMS.get("grw"));
        Map<String, Object> out = obj();
        out.put("potential5", potentialGroup(ordered, p5Ordered, .68 * 1.51, false));
        out.put("potentialMs", potentialGroup(ordered, pmsOrdered, 1.19 / 1.13, true));
        out.put("source", "supplied_type8_report_values");
        out.put("evidence_grade", "SOURCE_AND_DB_COMPUTED_RUNTIME_PENDING");
        return out;
    }

    private Map<String, Object> potentialGroup(List<Map<String, Object>> ordered, java.util.LinkedHashMap<String, List<String>> groups, double factor, boolean byIndex) {
        Map<String, Object> out = obj();
        for (Map.Entry<String, List<String>> e : groups.entrySet()) {
            List<Map<String, Object>> selected = new ArrayList<>();
            for (int i = 0; i < ordered.size(); i++) {
                String probe = byIndex ? String.valueOf(i + 1) : String.valueOf(lint(ordered.get(i).get("item")));
                if (e.getValue().contains(probe)) selected.add(ordered.get(i));
            }
            if (selected.isEmpty()) throw new IllegalStateException("POTENTIAL_GROUP_MISSING");
            double value = HalfUp.halfUp(sumRows(selected, "value") / selected.size() * factor);
            if (byIndex && value >= 100) value = 99;
            out.put(e.getKey(), value);
        }
        return out;
    }

    // ---- inference ---------------------------------------------------------
    List<Double> ghInferenceFeatures(Map<String, Object> replay) {
        List<Map<String, Object>> roles = listOf(replay.get("roles"));
        List<Map<String, Object>> rows = listOf(replay.get("rows"));
        List<Map<String, Object>> baseItems = new ArrayList<>();
        for (Map<String, Object> i : cfgItems) if (num(i.get("type")) == 4 || num(i.get("type")) == 5) baseItems.add(i);
        List<Double> out = new ArrayList<>(48);
        for (int id = 351; id <= 358; id++) {
            Map<String, Object> role = null;
            for (Map<String, Object> r : roles) if (lint(r.get("item")) == id) { role = r; break; }
            if (role == null) throw new IllegalStateException("INFERENCE_ROLE_MISSING");
            out.add(num(role.get("scoreB")));
            out.add(num(role.get("scoreC")));
            out.add(num(role.get("scoreD")));
            out.add(num(role.get("scoreNotion")));
        }
        for (Map<String, Object> i : baseItems) {
            Map<String, Object> row = null;
            for (Map<String, Object> r : rows) if (num(r.get("type")) == num(i.get("type")) && lint(r.get("item")) == lint(i.get("id"))) { row = r; break; }
            if (row == null) throw new IllegalStateException("INFERENCE_BASE_MISSING");
            out.add(num(row.get("score")));
        }
        if (out.size() != 48) throw new IllegalStateException("INFERENCE_FEATURES_INVALID");
        for (double v : out) if (!Double.isFinite(v)) throw new IllegalStateException("INFERENCE_FEATURES_INVALID");
        return out;
    }

    static final class Prediction {
        final double[] values;
        final double nearestDistance;
        final boolean outsideObservedDomain;
        Prediction(double[] values, double nearestDistance, boolean outside) {
            this.values = values; this.nearestDistance = nearestDistance; this.outsideObservedDomain = outside;
        }
    }

    static double clip(double x) { return Math.max(0, Math.min(100, x)); }

    Prediction predictGhAbility(List<Double> x) {
        if (x.size() != 48) throw new IllegalStateException("INFERENCE_FEATURES_INVALID");
        for (double v : x) if (!Double.isFinite(v)) throw new IllegalStateException("INFERENCE_FEATURES_INVALID");
        List<Double> mean = doubleList(c.model.get("mean"));
        List<Double> scale = doubleList(c.model.get("scale"));
        List<List<Double>> support = doubleLists(c.model.get("support"));
        List<List<Double>> coefficients = doubleLists(c.model.get("coefficients"));
        List<Double> targetMean = doubleList(c.model.get("target_mean"));
        double gamma = num(c.model.get("gamma"));
        double linearWeight = num(c.model.get("linear_weight"));
        double maxDist = num(c.model.get("max_training_nearest_distance"));
        double[] z = new double[48];
        for (int i = 0; i < 48; i++) z[i] = (x.get(i) - mean.get(i)) / scale.get(i);
        double[] predicted = new double[28];
        for (int j = 0; j < 28; j++) predicted[j] = targetMean.get(j);
        double distance = Double.POSITIVE_INFINITY;
        for (int row = 0; row < support.size(); row++) {
            List<Double> s = support.get(row);
            double d = 0, dot = 0;
            for (int i = 0; i < 48; i++) { double diff = s.get(i) - z[i]; d += diff * diff; dot += s.get(i) * z[i]; }
            distance = Math.min(distance, d / 48);
            double k = StrictMath.exp(-gamma * d / 48) + linearWeight * dot / 48;
            List<Double> co = coefficients.get(row);
            for (int j = 0; j < 28; j++) predicted[j] += k * co.get(j);
        }
        for (double v : predicted) if (!Double.isFinite(v)) throw new IllegalStateException("INFERENCE_PREDICTION_INVALID");
        double[] clipped = new double[28];
        for (int j = 0; j < 28; j++) clipped[j] = clip(predicted[j]);
        return new Prediction(clipped, distance, distance > maxDist);
    }

    static List<Double> doubleList(Object value) {
        List<Double> out = new ArrayList<>();
        for (Object v : (List<?>) value) out.add(num(v));
        return out;
    }

    static List<List<Double>> doubleLists(Object value) {
        List<List<Double>> out = new ArrayList<>();
        for (Object row : (List<?>) value) out.add(doubleList(row));
        return out;
    }

    Map<String, Object> cleanMetric(Map<String, Object> r) {
        Map<String, Object> out = obj();
        out.put("samples", r.get("samples"));
        out.put("cells", r.get("cells"));
        out.put("exact_display_rate", r.get("exact_display_rate"));
        out.put("within_one_rate", r.get("within_one_rate"));
        out.put("mean_absolute_error", r.get("mean_absolute_error"));
        out.put("p95_absolute_error", r.get("p95_absolute_error"));
        out.put("max_absolute_error", r.get("max_absolute_error"));
        out.put("all_28_exact_rate", r.get("all_28_exact_rate"));
        return out;
    }

    Map<String, Object> ghPublicInverseSummary() {
        Map<String, Object> s = mapOf(c.model.get("summary"));
        String[] auditKeys = {"quality_people", "quality_rows", "role_people", "eligible_intermediate_pairs", "independent_input_groups", "duplicate_input_rows", "same_input_conflicting_outputs_groups", "completion_pairing_window_seconds", "max_base_writing_duration_seconds", "all_base_and_derived_rows_within_120_seconds", "feature_count", "target_count", "known_questionnaire_pairs"};
        Map<String, Object> audit = obj();
        Map<String, Object> rawAudit = mapOf(s.get("audit"));
        for (String k : auditKeys) {
            Object v = rawAudit.get(k);
            if (v instanceof Number && Double.isFinite(num(v))) audit.put(k, v);
        }
        List<Map<String, Object>> perItem = new ArrayList<>();
        for (Map<String, Object> r : listOf(s.get("per_item_holdout"))) {
            Map<String, Object> row = obj();
            row.put("item", r.get("item"));
            row.put("exact_display_rate", r.get("exact_display_rate"));
            row.put("mean_absolute_error", r.get("mean_absolute_error"));
            row.put("p95_absolute_error", r.get("p95_absolute_error"));
            perItem.add(row);
        }
        Map<String, Object> out = obj();
        out.put("version", GH_INFERENCE_VERSION);
        out.put("audit", audit);
        out.put("selected_method", "RBF+linear kernel ridge; gamma=" + JsNumber.format(num(c.model.get("gamma"))));
        out.put("validation", cleanMetric(mapOf(s.get("validation"))));
        out.put("holdout", cleanMetric(mapOf(s.get("holdout"))));
        out.put("answer_chain", cleanMetric(mapOf(s.get("answer_chain"))));
        out.put("per_item_holdout", perItem);
        out.put("historical_replica_verified", false);
        out.put("recruitment_decision_allowed", false);
        out.put("limitations", List.of(
            "数据库中间分项配对不是完整高级报告实返；历史部署版本未锁定。",
            "原AgType8Map尚未恢复，28项是统计拟合估计。",
            "完整答卷链只有6份且有重建/版本风险；不代表人群效度或招聘预测准确率。"
        ));
        return out;
    }

    Map<String, Object> qualityDefinition(long item) {
        for (Map<String, Object> i : cfgItems)
            if (num(i.get("type")) == 8 && lint(i.get("parent")) != 0 && lint(i.get("id")) == item) return i;
        throw new IllegalStateException("quality definition missing");
    }

    Map<String, Object> scoreGhInferredReport(Map<String, Object> replay, Prediction prediction) {
        List<Double> qualityIds = doubleList(c.model.get("quality_ids"));
        List<Map<String, Object>> abilities = new ArrayList<>();
        for (int i = 0; i < qualityIds.size(); i++) {
            long item = (long) (double) qualityIds.get(i);
            Map<String, Object> definition = qualityDefinition(item);
            Map<String, Object> a = obj();
            a.put("item", definition.get("id"));
            a.put("name", definition.get("name"));
            a.put("parent", definition.get("parent"));
            a.put("value", HalfUp.halfUp(prediction.values[i]));
            a.put("unrounded_prediction", prediction.values[i]);
            a.put("origin", "empirical_inverse_estimate");
            abilities.add(a);
        }
        List<Map<String, Object>> ordered = new ArrayList<>(abilities);
        ordered.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -num(m.get("value"))).thenComparingLong(m -> lint(m.get("parent"))).thenComparingLong(m -> lint(m.get("item"))));
        List<Map<String, Object>> groupsOut = new ArrayList<>();
        for (Map<String, Object> i : cfgType(8, false)) {
            if (lint(i.get("parent")) != 0) continue;
            List<Map<String, Object>> rows = new ArrayList<>();
            for (Map<String, Object> a : abilities) if (lint(a.get("parent")) == lint(i.get("id"))) rows.add(a);
            Map<String, Object> g = obj();
            g.put("item", i.get("id"));
            g.put("name", i.get("name"));
            g.put("value", HalfUp.halfUp(sumRows(rows, "value") / rows.size()));
            groupsOut.add(g);
        }
        List<Map<String, Object>> potentialInput = new ArrayList<>();
        for (Map<String, Object> a : abilities) {
            Map<String, Object> r = obj();
            r.put("item", a.get("item"));
            r.put("value", a.get("value"));
            potentialInput.add(r);
        }
        Map<String, Object> potential = deriveGhPotentialGroups(potentialInput);
        Map<String, Object> out = copy(replay);
        out.put("version", GH_INFERENCE_VERSION);
        out.put("kind", "qilun_inverse_development_reference");
        out.put("abilities", abilities);
        Map<String, Object> abilitySummary = obj();
        abilitySummary.put("top_six", new ArrayList<>(ordered.subList(0, 6)));
        abilitySummary.put("bottom_three", new ArrayList<>(ordered.subList(ordered.size() - 3, ordered.size())));
        abilitySummary.put("groups", groupsOut);
        abilitySummary.put("potential5", potential.get("potential5"));
        abilitySummary.put("potentialMs", potential.get("potentialMs"));
        abilitySummary.put("source", "estimated_type8_values");
        abilitySummary.put("evidence_grade", "ESTIMATED_INPUTS_WITH_KNOWN_GROUP_FORMULA");
        out.put("ability_summary", abilitySummary);
        Map<String, Object> inference = ghPublicInverseSummary();
        inference.put("nearest_distance", prediction.nearestDistance);
        inference.put("outside_observed_domain", prediction.outsideObservedDomain);
        inference.put("exact_original_result", false);
        inference.put("output_basis", "已知原公式＋同窗中间分项与28项原版数据库分数的拟合");
        out.put("inference", inference);
        out.put("formal_score", false);
        out.put("persisted_as_person_report", false);
        out.put("recruitment_decision_allowed", false);
        List<Object> limitations = new ArrayList<>();
        limitations.add("28项能力是依据历史结果反推的估计，未恢复AgType8Map原权重。独立验证结果见本页，不声明99%或完全一致。");
        limitations.add(prediction.outsideObservedDomain ? "当前答卷超出已观察的中间分项邻域，估计不可靠，仅供核验。" : "本次处于已观察的中间分项邻域；相似输入仍不能保证原版结果相同。");
        for (Object l : (List<?>) replay.get("limitations")) if (!String.valueOf(l).contains("答案→28项")) limitations.add(l);
        out.put("limitations", limitations);
        return out;
    }

    // ---- qilun standard + invite -------------------------------------------
    public Map<String, Object> scoreQilunStandard(Map<String, Object> replay, Prediction prediction) {
        Map<String, Object> calculated = scoreGhInferredReport(replay, prediction);
        // TS destructuring removes inference+limitations only; version/kind keep their
        // first-layer positions and are overwritten in place by the result spread.
        Map<String, Object> result = copy(calculated);
        Map<String, Object> oldInference = mapOf(result.remove("inference"));
        result.remove("limitations");
        result.put("version", QILUN_STANDARD_VERSION);
        result.put("kind", "qilun_standard_development_result");
        Map<String, Object> product = obj();
        product.put("version", QILUN_STANDARD_VERSION);
        Object fingerprint = rulesFingerprint;
        product.put("rules_fingerprint", fingerprint);
        product.put("ability_count", 28L);
        product.put("abilities_basis", "fixed_model_reference");
        product.put("runtime_training", false);
        product.put("runtime_ai_generation", false);
        Map<String, Object> inference = obj();
        inference.put("outside_observed_domain", oldInference.get("outside_observed_domain"));
        inference.put("exact_original_result", false);
        List<Object> limitations = new ArrayList<>();
        limitations.add(str(c.rulebook.get("public_note")));
        if (Boolean.TRUE.equals(oldInference.get("outside_observed_domain"))) limitations.add("本次能力画像参考性较低，请结合实际经历核对。");
        Map<String, Object> out = obj();
        out.putAll(result);
        out.put("version", QILUN_STANDARD_VERSION);
        out.put("kind", "qilun_standard_development_result");
        out.put("product", product);
        out.put("inference", inference);
        out.put("limitations", limitations);
        return out;
    }

    public Map<String, Object> scoreInvite(Map<String, Integer> answers, List<List<String>> selected, List<String> ranked) {
        List<Map<String, Object>> values = new ArrayList<>();
        for (int i = 0; i < ranked.size(); i++) {
            Map<String, Object> v = obj();
            v.put("id", ranked.get(i));
            v.put("rank", (long) (i + 1));
            values.add(v);
        }
        Map<String, Object> first = scoreGhFirstLayer(answers, values);
        Map<String, Object> replay = scoreGhReportReplay(first, listOf(first.get("rows")), selected, ranked);
        Prediction prediction = predictGhAbility(ghInferenceFeatures(replay));
        Map<String, Object> result = scoreQilunStandard(replay, prediction);
        Map<String, Object> out = obj();
        out.put("kind", "qilun_277_invite_reference");
        out.put("version", QILUN_STANDARD_VERSION);
        out.put("persisted_as_person_reference", true);
        out.put("formal_score", false);
        out.put("recruitment_decision_allowed", false);
        out.put("result", result);
        return out;
    }
}
