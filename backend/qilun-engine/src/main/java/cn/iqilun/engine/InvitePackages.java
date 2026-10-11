package cn.iqilun.engine;

import static cn.iqilun.engine.Catalog.listOf;
import static cn.iqilun.engine.Catalog.mapOf;
import static cn.iqilun.engine.Catalog.lint;
import static cn.iqilun.engine.Catalog.str;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Builders for the invite packages (gh-invite.ts ghInvitePackage /
 * qilunStandardInvitePackage, self-review.ts selfReviewPackage). Object key
 * order matches the TS literals so stored/returned package JSON is byte-exact.
 */
public final class InvitePackages {

    private InvitePackages() {}

    /** ghInvitePackage(modelHash) — keys in TS literal order. */
    public static Map<String, Object> ghInvitePackage(Catalog c, String modelHash) {
        Map<String, Object> out = Engine.obj();
        List<Object> displayed = (List<Object>) c.derivedCfg.get("displayed_value_ids");
        List<List<String>> valueGroups = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            List<String> group = new ArrayList<>();
            for (int j = 0; j < 8; j++) group.add(String.valueOf(displayed.get(i * 8 + j)));
            valueGroups.add(group);
        }
        Set<String> displayedSet = new HashSet<>();
        for (List<String> g : valueGroups) displayedSet.addAll(g);
        Map<String, Object> bank = mapOf(c.serverRules); // unused; bank loaded separately below
        out.put("kind", "gh_reference_277");
        out.put("version", "qilun-277-reference/1.0.0");
        out.put("title", "齐论AI · 277题发展参考测评");
        out.put("consent_version", "qilun-277-reference-consent/1");
        out.put("notice", "自愿参与的发展参考测评，不是原版全同认证或录用测试。已知规则计算风格、性格、动机、价值观、角色与优势；能力未启用时留白，启用后为历史数据拟合估计。不用于自动招聘排名、淘汰或岗位安排。答案、价值观选择与参考结果将按邀请用途保存。");
        out.put("estimate_abilities", modelHash != null);
        out.put("model_hash", modelHash);
        out.put("scoring_version", "gh-report-replay-v22");
        List<Map<String, Object>> questions = new ArrayList<>();
        for (Map<String, Object> q : listOf(c.bank.get("questions"))) {
            Map<String, Object> row = Engine.obj();
            row.put("id", q.get("id"));
            row.put("order", q.get("order"));
            row.put("module", q.get("module"));
            row.put("answer_type", q.get("answer_type"));
            row.put("title", q.get("title"));
            row.put("a", q.get("a"));
            row.put("b", q.get("b"));
            questions.add(row);
        }
        out.put("questions", questions);
        Map<String, Object> choices = Engine.obj();
        choices.put("paired", List.of("A非常符合", "A比较符合", "中立", "B比较符合", "B非常符合"));
        choices.put("single", List.of("完全符合", "多数符合", "一般符合", "偶尔符合", "完全不符"));
        out.put("choices", choices);
        out.put("value_groups", valueGroups);
        List<Map<String, Object>> words = new ArrayList<>();
        for (Map<String, Object> v : listOf(c.serverRules.get("values"))) {
            if (!displayedSet.contains(str(v.get("id")))) continue;
            Map<String, Object> row = Engine.obj();
            row.put("id", v.get("id"));
            row.put("title", v.get("title"));
            row.put("description", v.get("description"));
            words.add(row);
        }
        out.put("words", words);
        out.put("layout", "captured_32_words_v3");
        return out;
    }

    /** qilunStandardInvitePackage(rules) — spread then override in place, append rule_profile. */
    public static Map<String, Object> qilunStandardInvitePackage(Catalog c, String modelHash, String rulesFingerprint, String rulebookTitle, String rulebookNotice) {
        Map<String, Object> out = ghInvitePackage(c, modelHash);
        out.put("version", Engine.QILUN_STANDARD_VERSION);
        out.put("title", rulebookTitle);
        out.put("consent_version", "qilun-internal-assessment-consent/1.0.0");
        out.put("notice", rulebookNotice);
        Map<String, Object> ruleProfile = Engine.obj();
        ruleProfile.put("version", Engine.QILUN_STANDARD_VERSION);
        ruleProfile.put("fingerprint", rulesFingerprint);
        ruleProfile.put("abilities", "required");
        out.put("rule_profile", ruleProfile);
        return out;
    }

    /** selfReviewPackage constant (self-review.ts). */
    public static Map<String, Object> selfReviewPackage() {
        String[][] definitions = {
            {"财富", "报酬与资源", "我会关注付出与报酬是否相称。", "选择工作时，收入增长对我很重要。", "我愿意为明确的经济回报安排额外投入。"},
            {"健康", "节奏与恢复", "我希望工作安排给休息留出稳定空间。", "持续忙碌后，我会优先安排恢复。", "选择工作方式时，我重视可持续的节奏。"},
            {"享受", "体验与乐趣", "工作过程是否有趣会影响我的投入。", "我喜欢在任务中寻找让我愉快的部分。", "选择任务时，我重视过程中的积极体验。"},
            {"工作", "完成与精进", "把一项工作做完整会让我满足。", "我愿意持续练习，改进自己的工作方法。", "即使没有额外奖励，我也在意交付质量。"},
            {"权力", "自主与影响", "我希望能参与影响工作方向的决定。", "我愿意承担协调资源和推进事情的责任。", "我重视对自己的工作安排有决定空间。"},
            {"创新", "尝试与探索", "我愿意尝试尚不熟悉的工作方法。", "面对重复任务，我会寻找新的解决方式。", "有机会探索不同方案时，我通常感到有动力。"},
            {"情感", "关系与连接", "与同事建立信任关系对我很重要。", "我愿意花时间理解合作伙伴的需要。", "融洽的合作关系会增强我的工作投入。"},
            {"荣誉", "认可与反馈", "工作成果得到明确认可会激励我。", "我希望他人能够看见自己的贡献。", "积极的反馈会增强我继续投入的意愿。"},
        };
        List<Map<String, Object>> dimensions = new ArrayList<>();
        for (String[] d : definitions) {
            List<Map<String, Object>> questions = new ArrayList<>();
            for (int i = 2; i < d.length; i++) {
                Map<String, Object> q = Engine.obj();
                q.put("id", d[0] + "-" + (i - 1));
                q.put("text", d[i]);
                questions.add(q);
            }
            Map<String, Object> dim = Engine.obj();
            dim.put("id", d[0]);
            dim.put("label", d[1]);
            dim.put("questions", questions);
            dimensions.add(dim);
        }
        Map<String, Object> scoring = Engine.obj();
        scoring.put("type", "mean-linear-v1");
        scoring.put("minimum", 1L);
        scoring.put("maximum", 5L);
        scoring.put("missing", "reject");
        scoring.put("rounding", 2L);
        scoring.put("interpretation", "self-description-only");
        Map<String, Object> out = Engine.obj();
        out.put("id", "qilun-work-preferences");
        out.put("version", "1.0.0");
        out.put("title", "齐论工作偏好自评");
        out.put("notice", "齐论独立编制的24项自评，用于自我了解和发展沟通；不是高禾原版，不是经常模验证的心理量表，不用于招聘淘汰。可不参与，并与邀请人选择访谈方式沟通。");
        out.put("consent_version", "2026-09-v1");
        out.put("scale", List.of("很不符合", "较不符合", "一般", "较符合", "很符合"));
        out.put("dimensions", dimensions);
        out.put("scoring", scoring);
        return out;
    }
}
