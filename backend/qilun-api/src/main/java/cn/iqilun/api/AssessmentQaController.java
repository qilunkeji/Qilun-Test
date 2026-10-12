package cn.iqilun.api;

import cn.iqilun.common.Db;
import cn.iqilun.engine.Engine;
import cn.iqilun.engine.HalfUp;
import cn.iqilun.engine.JsJson;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Comparator;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Assessment QA family (19 endpoints) ported from assessment-routes.ts.
 * Static catalogs are embedded as extracted resources (byte-exact constants);
 * compute endpoints wrap the Engine methods ported for the golden gate plus
 * deriveMotivation/experiment/strength-v3 score ports below.
 */
@RestController
public class AssessmentQaController {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String[] DIMENSIONS = {"财富", "健康", "享受", "工作", "权力", "创新", "情感", "荣誉"};
    private static final String ENGINE_VERSION = "qilun-report-rules/0.1.0";
    private static final String REPLICA_VERSION = "evidence-v3-20260922";

    private final Db db;
    private final EngineRuntime engineRuntime;

    public AssessmentQaController(Db db, EngineRuntime engineRuntime) {
        this.db = db;
        this.engineRuntime = engineRuntime;
    }

    private static final Map<String, Object> CATALOGS = loadCatalogs();

    static Map<String, Object> loadCatalogs() {
        try (InputStream in = AssessmentQaController.class.getResourceAsStream("/assessment-catalogs.json")) {
            JsonNode node = new ObjectMapper().readTree(in);
            @SuppressWarnings("unchecked")
            Map<String, Object> out = (Map<String, Object>) cn.iqilun.common.JdbcJson.convert(node);
            return out;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static GuardsFilter.Auth leadOnly(HttpServletRequest request) {
        GuardsFilter.Auth a = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!"talent_lead".equals(a.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "测评后台仅人才负责人可访问");
        return a;
    }

    private static Map<String, Object> catalog(String key) {
        return new LinkedHashMap<>(CATALOGS.get(key) instanceof Map<?, ?> m ? castMap(m) : Map.of());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object o) { return (Map<String, Object>) o; }
    @SuppressWarnings("unchecked")
    private static List<Object> castList(Object o) { return (List<Object>) o; }

    // ------------------------------------------------------------------ GET endpoints
    @GetMapping("/api/v1/assessment/product-rules")
    public Map<String, Object> productRules(HttpServletRequest request) throws Exception {
        leadOnly(request);
        java.nio.file.Path rulebookPath = java.nio.file.Path.of("packages/assessment-engine/data/qilun-standard-v1.json");
        Map<String, Object> rulebook = CatalogJson.parse(java.nio.file.Files.readString(rulebookPath));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("available", engineRuntime.ready());
        out.put("rulebook", rulebook);
        out.put("rules_fingerprint", engineRuntime.ready() ? engineRuntime.engine().rulesFingerprint : null);
        out.put("problem", null);
        out.put("validation_summary", engineRuntime.ready() ? engineRuntime.engine().ghPublicInverseSummary() : null);
        return out;
    }

    @GetMapping("/api/v1/assessment/rules")
    public Map<String, Object> rules(HttpServletRequest request) {
        leadOnly(request);
        return catalog("ruleCatalog");
    }

    @GetMapping("/api/v1/assessment/replication")
    public Map<String, Object> replication(HttpServletRequest request) {
        leadOnly(request);
        return catalog("replicaCatalog");
    }

    @GetMapping("/api/v1/assessment/gh-evidence")
    public Map<String, Object> ghEvidence(HttpServletRequest request) {
        leadOnly(request);
        return catalog("ghEvidenceCatalog");
    }

    @GetMapping("/api/v1/assessment/gh-replay")
    public Map<String, Object> ghReplay(HttpServletRequest request) {
        leadOnly(request);
        return catalog("ghReplayCatalog");
    }

    @GetMapping("/api/v1/assessment/gh-inference")
    public Map<String, Object> ghInference(HttpServletRequest request) {
        leadOnly(request);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", Engine.GH_INFERENCE_VERSION);
        out.put("available", engineRuntime.ready());
        out.put("summary", engineRuntime.ready() ? engineRuntime.engine().ghPublicInverseSummary() : null);
        out.put("formal_report_available", false);
        out.put("formal_match_available", false);
        return out;
    }

    // ------------------------------------------------------------------ compute endpoints
    @PostMapping("/api/v1/assessment/gh-inference/score")
    public Object inferenceScore(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        leadOnly(request);
        if (!engineRuntime.ready())
            throw new ApiError(503, "INFERENCE_MODEL_UNAVAILABLE", "本机尚未载入已核验的离线推算模型；原公式核验仍可使用。");
        try {
            return inferenceScoreCompute(body);
        } catch (Exception e) {
            throw new ApiError(400, "INVALID_GH_INFERENCE_INPUT", e.getMessage());
        }
    }

    private Object inferenceScoreCompute(Map<String, Object> body) throws Exception {
        // scoreGhInferredReport(input, model): replay → features → predict → compose
        Engine engine = engineRuntime.engine();
        Map<String, Integer> answers = new LinkedHashMap<>();
        Object rawAnswers = body.get("answers");
        if (rawAnswers instanceof Map<?, ?> m) for (Map.Entry<?, ?> e : m.entrySet()) answers.put(String.valueOf(e.getKey()), ((Number) e.getValue()).intValue());
        List<List<String>> selected = new ArrayList<>();
        List<String> ranked = new ArrayList<>();
        if (body.get("value_flow") instanceof Map<?, ?> flow) {
            if (flow.get("selected_by_group") instanceof List<?> groups) for (Object g : groups) {
                List<String> group = new ArrayList<>();
                for (Object id : (List<?>) g) group.add(String.valueOf(id));
                selected.add(group);
            }
            if (flow.get("ranked") instanceof List<?> r) for (Object id : r) ranked.add(String.valueOf(id));
        }
        List<Map<String, Object>> values = new ArrayList<>();
        for (int i = 0; i < ranked.size(); i++) {
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("id", ranked.get(i));
            v.put("rank", (long) (i + 1));
            values.add(v);
        }
        Map<String, Object> first = engine.scoreGhFirstLayer(answers, values);
        Map<String, Object> replay = engine.scoreGhReportReplay(first, castMapList(first.get("rows")), selected, ranked);
        Engine.Prediction prediction = engine.predictGhAbility(engine.ghInferenceFeatures(replay));
        return engine.scoreGhInferredReport(replay, prediction);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> castMapList(Object o) { return (List<Map<String, Object>>) o; }

    @PostMapping("/api/v1/assessment/gh-replay/score")
    public Object replayScore(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        leadOnly(request);
        try {
            Engine engine = engineRuntime.engine();
            Map<String, Integer> answers = extractAnswers(body);
            ValueFlow vf = extractFlow(body);
            List<Map<String, Object>> values = new ArrayList<>();
            for (int i = 0; i < vf.ranked.size(); i++) {
                Map<String, Object> v = new LinkedHashMap<>();
                v.put("id", vf.ranked.get(i));
                v.put("rank", (long) (i + 1));
                values.add(v);
            }
            Map<String, Object> first = engine.scoreGhFirstLayer(answers, values);
            return engine.scoreGhReportReplay(first, castMapList(first.get("rows")), vf.selected, vf.ranked);
        } catch (ApiError e) { throw e; }
        catch (Exception e) { throw new ApiError(400, "INVALID_GH_REPLAY_INPUT", e.getMessage()); }
    }

    @PostMapping("/api/v1/assessment/gh-replay/final-match")
    public Object finalMatch(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        leadOnly(request);
        try {
            return replayFinalMatch(body);
        } catch (ApiError e) { throw e; }
        catch (Exception e) { throw new ApiError(400, "INVALID_GH_REPLAY_INPUT", e.getMessage()); }
    }

    private Object replayFinalMatch(Map<String, Object> body) {
        // replayGhFinalMatch — port of gh-derived.ts:154-177
        Object scores = ((Map<?, ?>) body.get("scores"));
        if (!(scores instanceof Map<?, ?> s)) throw new IllegalArgumentException("bad scores");
        String precision = String.valueOf(body.get("component_precision"));
        double[] weights = {.4, .3, .2, .1}, factors = {1.02, 1, 1, .98};
        String[] names = {"c8Score", "qualityScore", "motiveScore", "valueScore"};
        List<Map<String, Object>> terms = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("name", names[i]);
            t.put("type", (long) (i + 1));
            t.put("score", s.get(names[i]));
            t.put("weight", weights[i]);
            terms.add(t);
        }
        terms.sort(Comparator.comparingDouble((Map<String, Object> t) -> ((Number) t.get("score")).doubleValue())
            .thenComparingLong(t -> ((Number) t.get("type")).longValue()));
        double total = 0;
        for (int i = 0; i < 4; i++) {
            Map<String, Object> t = terms.get(i);
            t.put("factor", factors[i]);
            double contribution = ((Number) t.get("score")).doubleValue() * ((Number) t.get("weight")).doubleValue() * factors[i];
            t.put("contribution", contribution);
            total += contribution;
        }
        double rounded = HalfUp.halfUp(total);
        // legacy interval analysis: bound all 24 sorted regions of ±0.5 boxes (rounded mode)
        double minimum = Double.POSITIVE_INFINITY, maximum = Double.NEGATIVE_INFINITY;
        if ("rounded".equals(precision)) {
            double[][] box = new double[4][2];
            for (int i = 0; i < 4; i++) {
                double sc = ((Number) terms.get(i).get("score")).doubleValue();
                box[i][0] = Math.max(0, sc - .5);
                box[i][1] = Math.min(100, sc + .5);
            }
            Integer[] perm = {0, 1, 2, 3};
            List<Integer[]> perms = new ArrayList<>();
            permute(perm, 0, perms);
            for (Integer[] p : perms) {
                double[] low = new double[4], high = new double[4];
                double prevLow = 0, nextHigh = 100;
                for (int i = 0; i < 4; i++) {
                    low[i] = Math.max(box[p[i]][0], i > 0 ? low[i - 1] : 0);
                }
                for (int i = 3; i >= 0; i--) {
                    high[i] = Math.min(box[p[i]][1], i < 3 ? high[i + 1] : 100);
                }
                boolean feasible = true;
                for (int i = 0; i < 4; i++) if (low[i] > box[p[i]][1] || high[i] < box[p[i]][0]) feasible = false;
                if (!feasible) continue;
                double minSum = 0, maxSum = 0;
                for (int i = 0; i < 4; i++) {
                    minSum += low[i] * weights[((Number) terms.get(p[i]).get("type")).intValue() - 1] * factors[i];
                    maxSum += high[i] * weights[((Number) terms.get(p[i]).get("type")).intValue() - 1] * factors[i];
                }
                minimum = Math.min(minimum, minSum);
                maximum = Math.max(maximum, maxSum);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", Engine.GH_REPLAY_VERSION);
        out.put("route", "addSomeMatchPeoRecord");
        out.put("component_precision", precision);
        out.put("score", rounded);
        out.put("raw_total", total);
        out.put("terms", terms);
        out.put("historical_score_unique", "raw".equals(precision));
        List<Object> range = new ArrayList<>();
        if ("raw".equals(precision)) { range.add(rounded); range.add(rounded); }
        else { range.add(HalfUp.halfUp(minimum)); range.add(HalfUp.halfUp(maximum)); }
        out.put("possible_historical_score_range", range);
        out.put("formal_match", false);
        out.put("recruitment_decision_allowed", false);
        return out;
    }

    private static void permute(Integer[] arr, int k, List<Integer[]> out) {
        if (k >= arr.length) { out.add(arr.clone()); return; }
        for (int i = k; i < arr.length; i++) {
            Integer tmp = arr[k]; arr[k] = arr[i]; arr[i] = tmp;
            permute(arr, k + 1, out);
            tmp = arr[k]; arr[k] = arr[i]; arr[i] = tmp;
        }
    }

    @PostMapping("/api/v1/assessment/gh-replay/potential-groups")
    public Object potentialGroups(@RequestBody(required = false) List<Map<String, Object>> body, HttpServletRequest request) {
        leadOnly(request);
        try {
            return engineRuntime.engine().deriveGhPotentialGroups(body);
        } catch (ApiError e) { throw e; }
        catch (Exception e) { throw new ApiError(400, "INVALID_GH_REPLAY_INPUT", e.getMessage()); }
    }

    @PostMapping("/api/v1/assessment/gh-replay/position-model")
    public Object positionModel(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        leadOnly(request);
        try {
            return positionModelCompute(body);
        } catch (ApiError e) { throw e; }
        catch (Exception e) { throw new ApiError(400, "INVALID_GH_REPLAY_INPUT", e.getMessage()); }
    }

    private Object positionModelCompute(Map<String, Object> body) {
        // buildGhPositionModel port (members → rank-weighted competitiveness)
        double[] rankWeights = {10, 9, 8, 7, 6, 5, 4.5, 4, 3.5, 3, 2.6, 2.6, 2.6, 2.4, 2.4, 2.4, 2.1, 2.1, 2.1, 1.8, 1.8, 1.8, 1.5, 1.5, 1.5, 1.2, 1.2, 1.2};
        List<?> members = (List<?>) body.get("members");
        if (members == null || members.isEmpty()) throw new IllegalArgumentException("bad members");
        Map<Long, double[]> totals = new LinkedHashMap<>(); // item -> {competitiveness, sum, max}
        List<Map<String, Object>> memberRows = castMapList(members);
        for (Map<String, Object> member : memberRows) {
            List<Map<String, Object>> rows = castMapList(member.get("rows") != null ? member.get("rows") : member);
            List<Map<String, Object>> ordered = new ArrayList<>(rows);
            ordered.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -((Number) m.get("score")).doubleValue()));
            for (int i = 0; i < ordered.size(); i++) {
                long item = ((Number) ordered.get(i).get("item")).longValue();
                double score = ((Number) ordered.get(i).get("score")).doubleValue();
                double rounded = HalfUp.halfUp(score);
                double[] t = totals.computeIfAbsent(item, k -> new double[3]);
                t[0] += rankWeights[i] * (rounded > 80 ? 1.2 : rounded > 60 ? 1 : rounded > 0 ? .8 : 0);
                t[1] += rounded;
                t[2] = Math.max(t[2], score);
            }
        }
        List<Map<String, Object>> all = new ArrayList<>();
        for (Map.Entry<Long, double[]> e : totals.entrySet()) {
            if (e.getValue()[0] <= 0) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("item", e.getKey());
            row.put("rank", 0L);
            row.put("competitiveness", e.getValue()[0]);
            row.put("score", HalfUp.halfUp(e.getValue()[1] / memberRows.size()));
            row.put("maxScore", e.getValue()[2]);
            all.add(row);
        }
        all.sort(Comparator.<Map<String, Object>>comparingDouble(m -> -((Number) m.get("competitiveness")).doubleValue())
            .thenComparingLong(m -> ((Number) m.get("item")).longValue()));
        for (int i = 0; i < all.size(); i++) all.get(i).put("rank", (long) (i + 1));
        List<Object> visible = new ArrayList<>();
        for (Map<String, Object> r : all) {
            long rank = ((Number) r.get("rank")).longValue();
            if (rank <= 10 || rank >= 26) visible.add(r);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", Engine.GH_REPLAY_VERSION);
        out.put("route", "per_member_scoreCalibrateNew");
        out.put("member_count", (long) memberRows.size());
        out.put("rows", visible);
        out.put("all_rows", all);
        out.put("historical_input_recovered", false);
        out.put("formal_model", false);
        out.put("limitations", List.of(
            "仅复算每成员scoreCalibrateNew路线，不代替addPosi全体IN重复或旧scoreCalibrate路线。",
            "输入须为已选定同次测评成员的28项真实百分数；不执行账号绑定和历史成员猜测。"));
        return out;
    }

    @PostMapping("/api/v1/assessment/gh-evidence/score")
    public Object evidenceScore(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        leadOnly(request);
        try {
            Engine engine = engineRuntime.engine();
            Map<String, Integer> answers = extractAnswers(body);
            // ghEvidenceInput uses the TOP-LEVEL values array ({id, rank}), not value_flow
            List<Map<String, Object>> values = new ArrayList<>();
            if (body.get("values") instanceof List<?> vs) for (Object v : vs) {
                Map<?, ?> vm = (Map<?, ?>) v;
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", String.valueOf(vm.get("id")));
                row.put("rank", ((Number) vm.get("rank")).longValue());
                values.add(row);
            }
            return engine.scoreGhFirstLayer(answers, values);
        } catch (ApiError e) { throw e; }
        catch (Exception e) { throw new ApiError(400, "INVALID_GH_EVIDENCE_INPUT", e.getMessage()); }
    }

    // ------------------------------------------------------------------ replication / rules
    @PostMapping("/api/v1/assessment/replication/score")
    public Object replicationScore(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        leadOnly(request);
        String mode = String.valueOf(body == null ? null : body.get("mode"));
        if ("ghrczx_strength_153".equals(mode)) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("code", "TARGET_SCORING_UNVERIFIED");
            error.put("message", "旧153题接口不生成正式报告；新版277题基础分请使用独立证据试算入口。");
            error.put("missing", catalog("replicaCatalog").get("gaps"));
            throw new ApiErrorWithBody(409, error);
        }
        try {
            return scoreExternalStrengthV3(body);
        } catch (ApiError e) { throw e; }
        catch (Exception e) {
            throw new ApiError(400, "INVALID_REPLICA_ANSWERS", "请使用对应版本的全部180题答案，每题只选1至5。");
        }
    }

    /** strength-v3.ts scoreExternalStrengthV3 port (deterministic edge weights from embedded evidence). */
    @SuppressWarnings("unchecked")
    private Object scoreExternalStrengthV3(Map<String, Object> body) throws Exception {
        Map<String, Object> answersRaw = (Map<String, Object>) body.get("answers");
        Map<String, Object> replicaCat = catalog("replicaCatalog");
        // external questions are in packages[1].questions
        List<Map<String, Object>> packages = castMapList(replicaCat.get("packages"));
        List<Map<String, Object>> questions = castMapList(packages.get(1).get("questions"));
        Set<String> ids = new HashSet<>();
        for (Map<String, Object> q : questions) ids.add(String.valueOf(q.get("id")));
        for (Map.Entry<String, Object> e : answersRaw.entrySet()) {
            if (!ids.contains(e.getKey()) || !((Number) e.getValue()).equals(e.getValue()))
                throw new IllegalArgumentException("INVALID");
            int v = ((Number) e.getValue()).intValue();
            if (v < 1 || v > 5) throw new IllegalArgumentException("INVALID");
        }
        for (Map<String, Object> q : questions) if (!answersRaw.containsKey(String.valueOf(q.get("id"))))
            throw new IllegalArgumentException("INCOMPLETE");
        // weights/denominators come from the evidence file; reuse embedded replica catalog evidence? Not embedded.
        // Load directly from the data file via CatalogJson on the engine's data directory.
        Map<String, Object> evidence = loadEvidence();
        List<Map<String, Object>> weights = castMapList(evidence.get("weights"));
        Map<String, Object> denominators = castMap(evidence.get("bookDenominators"));
        Map<String, Double> totals = new LinkedHashMap<>();
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String theme : denominators.keySet()) { totals.put(theme, 0.0); counts.put(theme, 0L); }
        List<Map<String, Object>> contributions = new ArrayList<>();
        for (Map<String, Object> edge : weights) {
            int qIdx = ((Number) edge.get("q")).intValue();
            Map<String, Object> question = questions.get(qIdx - 1);
            int answer = ((Number) answersRaw.get(String.valueOf(question.get("id")))).intValue();
            List<Object> scoresList = castList(edge.get("scores"));
            double points = ((Number) scoresList.get(answer - 1)).doubleValue();
            String theme = String.valueOf(edge.get("theme"));
            totals.merge(theme, points, Double::sum);
            counts.merge(theme, 1L, Long::sum);
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("question_id", question.get("id"));
            c.put("order", edge.get("q"));
            c.put("theme", theme);
            c.put("side", edge.get("side"));
            c.put("answer", (long) answer);
            c.put("points", points);
            c.put("evidence", edge.get("evidence"));
            contributions.add(c);
        }
        List<Object> profiles = new ArrayList<>();
        profiles.add(profile("book118", totals, denominators));
        profiles.add(profile("observed_links", totals, toDoubleMap(counts)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", REPLICA_VERSION);
        out.put("kind", "external_evidence_trial");
        out.put("exact_replica_ready", false);
        out.put("warning", "这是外部180题v3计分表的确定性试算。历史回放存在反例，不是高禾正式测评结果。");
        out.put("profiles", profiles);
        out.put("contributions", contributions);
        out.put("excluded_edges", (long) castList(evidence.get("excludedRows")).size());
        out.put("missing_outputs", List.of("高禾153题计分", "高禾完整七模块报告", "原站平局顺序", "才干占比与能量星级"));
        return out;
    }

    private Map<String, Object> loadEvidence() throws Exception {
        java.nio.file.Path data = java.nio.file.Path.of("packages/assessment-engine/data/strength-v3.json");
        return CatalogJson.parse(java.nio.file.Files.readString(data));
    }

    private Map<String, Object> profile(String id, Map<String, Double> totals, Map<String, Object> divisors) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (String name : totals.keySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", name);
            row.put("raw", totals.get(name));
            row.put("denominator", divisors.get(name));
            rows.add(row);
        }
        java.util.function.ToDoubleFunction<Map<String, Object>> crossScore = r ->
            ((Number) r.get("raw")).doubleValue() / Math.max(1e-12, ((Number) r.get("denominator")).doubleValue());
        // legacy compares integer cross-products b.raw*a.den - a.raw*b.den (descending)
        rows.sort((x, y) -> {
            double cx = ((Number) y.get("raw")).doubleValue() * ((Number) x.get("denominator")).doubleValue();
            double cy = ((Number) x.get("raw")).doubleValue() * ((Number) y.get("denominator")).doubleValue();
            return Double.compare(cx, cy);
        });
        List<Object> ranking = new ArrayList<>();
        List<Object> top5 = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> r = new LinkedHashMap<>(row);
            r.put("score", ((Number) row.get("raw")).doubleValue() / ((Number) row.get("denominator")).doubleValue());
            long rank = 1;
            for (Map<String, Object> other : rows) {
                double c = ((Number) other.get("raw")).doubleValue() * ((Number) row.get("denominator")).doubleValue()
                    - ((Number) row.get("raw")).doubleValue() * ((Number) other.get("denominator")).doubleValue();
                if (c < 0) rank++;
            }
            r.put("rank", rank);
            ranking.add(r);
            if (rank <= 5) top5.add(r.get("name"));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("ranking", ranking);
        out.put("top5_candidates", top5);
        out.put("cutoff_tied", top5.size() > 5);
        return out;
    }

    private static Map<String, Object> toDoubleMap(Map<String, Long> counts) {
        Map<String, Object> out = new LinkedHashMap<>();
        counts.forEach((k, v) -> out.put(k, v == null ? 0.0 : v.doubleValue()));
        return out;
    }

    @PostMapping("/api/v1/assessment/rules/experiment")
    public Object rulesExperiment(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = leadOnly(request);
        Map<String, Object> result = experiment(body);
        String hash = cn.iqilun.common.Crypto.digest(JsJson.stringify(body));
        db.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
            UUID.randomUUID().toString(), a.tenantId(), a.userId(), "assessment.synthetic_experiment", hash);
        Map<String, Object> out = new LinkedHashMap<>(result);
        out.put("input_hash", hash);
        return out;
    }

    /** experimental.ts experiment port — authored 6-item fixture. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> experiment(Map<String, Object> body) {
        List<Number> answers = (List<Number>) body.get("answers");
        List<List<Number>> benchmarks = (List<List<Number>>) body.get("benchmarks");
        List<Number> weightsIn = (List<Number>) body.get("weights");
        String aggregation = String.valueOf(body.get("aggregation"));
        if (answers == null || answers.size() != 6 || benchmarks == null || benchmarks.isEmpty() || benchmarks.size() > 5
            || weightsIn == null || weightsIn.size() != 3)
            throw ResumeController.invalidInput();
        java.util.function.Function<List<Number>, List<Map<String, Object>>> derive = (ans) -> {
            List<Map<String, Object>> out = new ArrayList<>();
            for (int i : new int[]{0, 2, 4}) {
                double keyed0 = ans.get(i).doubleValue(), keyed1 = 6 - ans.get(i + 1).doubleValue();
                double sum = keyed0 + keyed1;
                Map<String, Object> d = new LinkedHashMap<>();
                d.put("items", List.of((long) (i + 1), (long) (i + 2)));
                d.put("keyed", List.of(keyed0, keyed1));
                d.put("sum", sum);
                d.put("normalized", 100 * (sum - 2) / 8);
                out.add(d);
            }
            return out;
        };
        List<Map<String, Object>> candidate = derive.apply(answers);
        List<List<Map<String, Object>>> benchmarkRows = new ArrayList<>();
        for (List<Number> b : benchmarks) benchmarkRows.add(derive.apply(b));
        List<Double> target = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            List<Double> xs = new ArrayList<>();
            for (List<Map<String, Object>> b : benchmarkRows) xs.add(((Number) b.get(i).get("normalized")).doubleValue());
            xs.sort(Double::compareTo);
            int n = xs.size();
            target.add("mean".equals(aggregation) ? xs.stream().mapToDouble(Double::doubleValue).sum() / n
                : (xs.get((n - 1) / 2) + xs.get(n / 2)) / 2);
        }
        double totalWeight = weightsIn.stream().mapToDouble(Number::doubleValue).sum();
        List<Double> weights = new ArrayList<>();
        for (Number w : weightsIn) weights.add(w.doubleValue() / totalWeight);
        List<Double> differences = new ArrayList<>();
        for (int i = 0; i < 3; i++) differences.add(Math.abs(((Number) candidate.get(i).get("normalized")).doubleValue() - target.get(i)) / 100);
        List<Double> components = new ArrayList<>();
        for (double d : differences) components.add(100 * (1 - d));
        double linear = 0;
        for (int i = 0; i < 3; i++) linear += components.get(i) * weights.get(i);
        double quadSum = 0;
        for (int i = 0; i < 3; i++) quadSum += weights.get(i) * differences.get(i) * differences.get(i);
        double quadratic = 100 * (1 - Math.sqrt(quadSum));
        double bottleneck = components.stream().mapToDouble(Double::doubleValue).min().orElse(0);
        double spread = Math.max(linear, Math.max(quadratic, bottleneck)) - Math.min(linear, Math.min(quadratic, bottleneck));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", "qilun-synthetic-chain/0.1.0");
        out.put("status", "authored_experiment");
        out.put("original_algorithm_recovered", false);
        out.put("formal_score", false);
        out.put("recruitment_decision_allowed", false);
        out.put("persisted_as_person_report", false);
        out.put("key_origin", "项目自定义6项数学夹具；不是高禾题库，也不是IPIP量表");
        out.put("candidate", candidate);
        out.put("benchmarks", benchmarkRows);
        out.put("target", target);
        out.put("weights", weights);
        out.put("differences", differences);
        out.put("components", components);
        Map<String, Object> alternatives = new LinkedHashMap<>();
        alternatives.put("weighted_linear", linear);
        alternatives.put("weighted_quadratic", quadratic);
        alternatives.put("bottleneck", bottleneck);
        out.put("alternatives", alternatives);
        out.put("spread", spread);
        out.put("trace", List.of("反向项=6-x；每两项加和", "0–100=(原始和-2)/8×100，仅理论范围重标度，不是百分位",
            "标杆聚合=" + aggregation + "；未恢复高禾聚合", "分项=100×(1-|个人-目标|/100)",
            "线性=Σw×分项；二次=100×(1-√Σw×差距²)；短板=min(分项)",
            "三种总分都是待验证方法，没有自动选择最接近报告的一种作为真值"));
        out.put("limitations", List.of("只接收六项合成数值，不绑定候选人、岗位或人格标签。", "无常模、效度、录用概率或高禾兼容声明。", "缺少原始答案与岗位结果配对数据，不能评估哪种总分是真实原算法。"));
        return out;
    }

    @PostMapping("/api/v1/assessment/rules/validate")
    public Object rulesValidate(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        leadOnly(request);
        if (body != null && !body.isEmpty()) throw ResumeController.invalidInput();
        return catalog("formalPublication");
    }

    @PostMapping("/api/v1/assessment/rules/derive")
    public Object rulesDerive(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = leadOnly(request);
        Map<String, Object> result = deriveMotivation(body);
        String inputHash = cn.iqilun.common.Crypto.digest(JsJson.stringify(body));
        db.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
            UUID.randomUUID().toString(), a.tenantId(), a.userId(), "assessment.rule_verification", inputHash);
        Map<String, Object> out = new LinkedHashMap<>(result);
        out.put("input_hash", inputHash);
        out.put("persisted_as_person_report", false);
        return out;
    }

    /** rules.ts deriveMotivation port — W/L rounding BEFORE subtraction (toFixed(2)). */
    @SuppressWarnings("unchecked")
    private Map<String, Object> deriveMotivation(Map<String, Object> body) {
        String adapter = String.valueOf(body.get("adapter"));
        boolean phone = "gh_phone_senior_v81".equals(adapter);
        Map<String, Number> s = (Map<String, Number>) body.get("scores");
        double workSum = s.get("财富").doubleValue() + s.get("工作").doubleValue() + s.get("创新").doubleValue() + s.get("荣誉").doubleValue() + s.get("权力").doubleValue();
        double lifeSum = s.get("健康").doubleValue() + s.get("享受").doubleValue() + s.get("情感").doubleValue();
        double workDivisor = phone ? 5 : 25, lifeDivisor = phone ? 3 : 15;
        double w = Double.parseDouble(String.format("%.2f", workSum / workDivisor));
        double l = Double.parseDouble(String.format("%.2f", lifeSum / lifeDivisor));
        double d = w - l;
        double k = piecewiseWeight(d);
        double i = d * (1 - k) + w * k;
        Map<String, Object> groups = new LinkedHashMap<>();
        groups.put("安乐", s.get("享受").doubleValue() + s.get("健康").doubleValue());
        groups.put("归属", s.get("情感").doubleValue() + s.get("荣誉").doubleValue());
        groups.put("权利", s.get("权力").doubleValue() + s.get("财富").doubleValue());
        groups.put("成就", s.get("工作").doubleValue() + s.get("创新").doubleValue());
        double highest = groups.values().stream().mapToDouble(v -> ((Number) v).doubleValue()).max().orElse(0);
        List<String> highestGroups = new ArrayList<>();
        for (Map.Entry<String, Object> e : groups.entrySet()) if (((Number) e.getValue()).doubleValue() == highest) highestGroups.add(e.getKey());
        double sum = 0;
        for (String n : DIMENSIONS) sum += s.get(n).doubleValue();
        boolean hasTemplate = body.get("template") instanceof Map<?, ?>;
        Long occupationBand = null, energyBand = null;
        if (hasTemplate) {
            occupationBand = i < 0 ? 0L : i < 3.6 ? 1L : i < 6.1 ? 2L : 3L;
            energyBand = sum < 257.5 ? 0L : sum < 375 ? 1L : sum < 472.5 ? 2L : 3L;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("engine_version", ENGINE_VERSION);
        out.put("adapter", adapter);
        out.put("source_field", body.get("source_field"));
        out.put("scale_ref", body.get("scale_ref"));
        out.put("input_kind", body.get("input_kind"));
        out.put("status", "display_derivation_only");
        out.put("purpose", "rule_verification_only");
        out.put("formal_score", false);
        out.put("recruitment_decision_allowed", false);
        out.put("groups", groups);
        out.put("highest_groups", highestGroups);
        out.put("tie", highestGroups.size() > 1);
        out.put("W", w);
        out.put("L", l);
        out.put("D", d);
        out.put("k", k);
        out.put("I", i);
        out.put("motivation_sum", sum);
        out.put("work_life_label", phone ? (d > 1 ? "工作倾向" : d < -1 ? "生活倾向" : "兼顾") : null);
        out.put("occupation_band", occupationBand);
        out.put("energy_band", energyBand);
        out.put("band_index_base", 0L);
        out.put("template_ref", hasTemplate ? ((Map<?, ?>) body.get("template")).get("reference") : null);
        List<Object> limitations = new ArrayList<>();
        limitations.add("输入是已有基础分，不是问卷答案；此计算不证明题项计分或正式人岗匹配已还原。");
        limitations.add("不得据自陈人格、动机或类型进行招聘排序、淘汰或岗位安排。");
        if (highestGroups.size() > 1) limitations.add("并列组全部保留，不猜测原系统隐藏排序/平局规则。");
        limitations.add(hasTemplate ? "手机分档仅对应 E1 指定时点模板，不推广为全账号通用阈值。" : "未提供适用模板阈值，分档保持 null；PC 不套用手机参数。");
        limitations.add("manual_report_values".equals(String.valueOf(body.get("input_kind")))
            ? "手工报告输入仅试算；PDF 数值不等于已确认接口来源和量尺。" : "合成样例，不是任何人的真实结果。");
        out.put("limitations", limitations);
        List<Object> trace = new ArrayList<>();
        Map<String, Object> t1 = new LinkedHashMap<>();
        t1.put("rule_id", "MOT-01");
        t1.put("source", "E5 §四.A / E1 §四.2");
        t1.put("operation", "四组分别加和；最大并列保留");
        t1.put("result", groups);
        trace.add(t1);
        Map<String, Object> t2 = new LinkedHashMap<>();
        t2.put("rule_id", phone ? "MOT-PHONE-01" : "MOT-PC-01");
        t2.put("source", phone ? "E1 §四.1、3" : "E5 §四.B");
        t2.put("operation", "W=toFixed(工作五项和/" + (long) workDivisor + ",2); L=toFixed(生活三项和/" + (long) lifeDivisor + ",2)");
        Map<String, Object> t2r = new LinkedHashMap<>();
        t2r.put("workSum", workSum);
        t2r.put("lifeSum", lifeSum);
        t2r.put("W", w);
        t2r.put("L", l);
        t2r.put("D", d);
        t2.put("result", t2r);
        trace.add(t2);
        Map<String, Object> t3 = new LinkedHashMap<>();
        t3.put("rule_id", "MOT-WEIGHT-01");
        t3.put("source", "E1 §四.4 / E5 §四.B");
        t3.put("operation", "abs(D)≤1:0.2; ≤5:0.3; ≤10:0.4; >10:0; I=D*(1-k)+W*k");
        Map<String, Object> t3r = new LinkedHashMap<>();
        t3r.put("k", k);
        t3r.put("I", i);
        t3.put("result", t3r);
        trace.add(t3);
        Map<String, Object> t4 = new LinkedHashMap<>();
        t4.put("rule_id", "MOT-BANDS-01");
        t4.put("source", hasTemplate ? "E1 §四.4、5" : "尚无适用分档配置");
        t4.put("operation", hasTemplate ? "使用指定手机模板阈值" : "不生成分档");
        Map<String, Object> t4r = new LinkedHashMap<>();
        t4r.put("occupationBand", occupationBand);
        t4r.put("energyBand", energyBand);
        t4.put("result", t4r);
        trace.add(t4);
        out.put("trace", trace);
        return out;
    }

    static double piecewiseWeight(double difference) {
        double d = Math.abs(difference);
        return d <= 1 ? 0.2 : d <= 5 ? 0.3 : d <= 10 ? 0.4 : 0;
    }

    @PostMapping("/api/v1/assessment/rules/publish")
    public Object rulesPublish(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) throws Exception {
        return blocked("publish", body, request);
    }

    @PostMapping("/api/v1/assessment/rules/match")
    public Object rulesMatch(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) throws Exception {
        return blocked("match", body, request);
    }

    private Object blocked(String action, Map<String, Object> body, HttpServletRequest request) throws Exception {
        GuardsFilter.Auth a = leadOnly(request);
        if (body != null && !body.isEmpty()) throw ResumeController.invalidInput();
        db.query("INSERT INTO audit_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",
            UUID.randomUUID().toString(), a.tenantId(), a.userId(), "assessment." + action + "_blocked");
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", "MISSING_SCORING_RULES");
        error.put("message", "正式计分/匹配尚不具备条件，未产生分数");
        error.put("missing", catalog("formalPublication").get("missing"));
        throw new ApiErrorWithBody(409, error);
    }

    // ------------------------------------------------------------------ helpers
    private static final class ValueFlow {
        final List<List<String>> selected = new ArrayList<>();
        final List<String> ranked = new ArrayList<>();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Integer> extractAnswers(Map<String, Object> body) {
        Map<String, Integer> answers = new LinkedHashMap<>();
        if (body.get("answers") instanceof Map<?, ?> m)
            for (Map.Entry<?, ?> e : m.entrySet()) answers.put(String.valueOf(e.getKey()), ((Number) e.getValue()).intValue());
        return answers;
    }

    private static ValueFlow extractFlow(Map<String, Object> body) {
        ValueFlow vf = new ValueFlow();
        if (body.get("value_flow") instanceof Map<?, ?> flow) {
            if (flow.get("selected_by_group") instanceof List<?> groups)
                for (Object g : groups) {
                    List<String> group = new ArrayList<>();
                    for (Object id : (List<?>) g) group.add(String.valueOf(id));
                    vf.selected.add(group);
                }
            if (flow.get("ranked") instanceof List<?> r)
                for (Object id : r) vf.ranked.add(String.valueOf(id));
        }
        return vf;
    }

    /** ApiError carrying extra top-level error fields (missing lists). */
    static final class ApiErrorWithBody extends ApiError {
        final Map<String, Object> body;
        ApiErrorWithBody(int status, Map<String, Object> errorBody) {
            super(status, String.valueOf(errorBody.get("code")), String.valueOf(errorBody.get("message")));
            this.body = errorBody;
        }
    }
}
