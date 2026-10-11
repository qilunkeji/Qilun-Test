package cn.iqilun.api;

import cn.iqilun.common.Crypto;
import cn.iqilun.common.Db;
import cn.iqilun.engine.Engine;
import cn.iqilun.engine.JsJson;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public assessment endpoints ported from invite-routes.ts and
 * public-entry-routes.ts: token lookup with rate limits, consent, save/submit
 * with the frozen engine, and shared-entry enrollment.
 */
@RestController
public class PublicController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Db db;
    private final ApiProperties properties;
    private final EngineRuntime engine;
    private final Map<String, long[]> failures = new ConcurrentHashMap<>();
    private final Map<String, long[]> limits = new ConcurrentHashMap<>();

    public PublicController(Db db, ApiProperties properties, EngineRuntime engine) {
        this.db = db;
        this.properties = properties;
        this.engine = engine;
    }

    // ------------------------------------------------------------- rate limiting
    private void inviteLimit(boolean hit) {
        String ip = Crypto.digest("127.0.0.1");
        long now = System.currentTimeMillis();
        long[] slot = failures.get(ip);
        if (slot != null && slot[1] < now) { failures.remove(ip); slot = null; }
        if (slot != null && slot[0] >= 10) throw new ApiError(429, "RATE_LIMITED", "访问尝试过多，请10分钟后再试");
        if (hit) {
            long[] s = failures.computeIfAbsent(ip, k -> new long[]{0, 0});
            s[0] += 1;
            s[1] = now + 600_000L;
        }
    }

    private void entryLimit() {
        String ip = Crypto.digest("127.0.0.1");
        long now = System.currentTimeMillis();
        long[] v = limits.computeIfAbsent(ip, k -> new long[]{0, now + 60_000L});
        if (v[0] >= 60 || limits.size() > 10000) throw new ApiError(429, "RATE_LIMITED", "访问过于频繁，请稍后再试");
        v[0] += 1;
    }

    // ------------------------------------------------------------- invite lookup
    static final String ARCHIVE_JOIN = InviteAdminController.archiveJoinStatic();
    static final String RETAINED = InviteAdminController.retainedStatic();

    private Map<String, Object> lookup(String token, String pin, boolean lock) throws Exception {
        inviteLimit(false);
        String hash = Crypto.digest(token);
        String sql = "SELECT i.*,coalesce(c.name,'独立测评') AS name FROM assessment_invites i " + ARCHIVE_JOIN
            + " WHERE i.token_hash=$1 AND (i.pin_required=false OR i.pin_hash=$2) AND i.revoked_at IS NULL"
            + " AND i.expires_at>now() AND NOT EXISTS(SELECT 1 FROM assessment_public_entries e WHERE e.token_hash=i.token_hash)"
            + " AND " + RETAINED + (lock ? " FOR UPDATE OF i" : "");
        List<Map<String, Object>> rows = db.query(sql, hash, Crypto.digest(hash + ":" + (pin == null ? "" : pin)));
        // legacy computes digest(`${hash}:${input.pin}`) — undefined pin becomes "undefined"
        if (rows.isEmpty()) {
            if (pin == null) {
                rows = db.query(sql, hash, Crypto.digest(hash + ":undefined"));
                if (rows.isEmpty()) { inviteLimit(true); throw InviteAdminController.inviteMissing(); }
            } else {
                inviteLimit(true);
                throw InviteAdminController.inviteMissing();
            }
        }
        return rows.get(0);
    }

    private static boolean isGh(Map<String, Object> pkg) {
        return pkg != null && "gh_reference_277".equals(pkg.get("kind"));
    }


    /** jsonb columns arrive already parsed (JdbcValues) — only parse raw strings. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> jsonOf(Object raw) throws Exception {
        if (raw instanceof Map) return (Map<String, Object>) raw;
        return CatalogJson.parse(String.valueOf(raw));
    }

    private Map<String, Object> pkgOf(Object raw) throws Exception {
        return jsonOf(raw);
    }

    // ------------------------------------------------------------- open
    @PostMapping("/api/v1/public/assessment/open")
    public Map<String, Object> open(@RequestBody(required = false) Map<String, Object> body) throws Exception {
        String token = requireToken(body, false);
        String pin = pinOf(body);
        Map<String, Object> row = lookup(token, pin, false);
        Map<String, Object> pkg = pkgOf(row.get("package"));
        Map<String, Object> metadata = metadata(row);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("id"));
        Object participantName = metadata.get("participant_name");
        out.put("name", participantName != null ? participantName : row.get("name"));
        out.put("metadata", metadata);
        out.put("package", pkg);
        out.put("purpose", row.get("purpose"));
        out.put("expires_at", row.get("expires_at"));
        out.put("answers", row.get("answers"));
        if (isGh(pkg)) {
            Object valueDraft = row.get("value_draft");
            out.put("value_draft", valueDraft == null ? emptyValues() : jsonOf(valueDraft));
            Object uiProgress = row.get("ui_progress");
            out.put("ui_progress", uiProgress == null ? null : jsonOf(uiProgress));
        }
        out.put("revision", row.get("revision"));
        out.put("consented", row.get("consent_at") != null);
        out.put("submitted", row.get("submitted_at") != null);
        out.put("report", row.get("report") == null ? null : jsonOf(row.get("report")));
        out.put("submitted_at", row.get("submitted_at"));
        out.put("package_hash", row.get("package_hash"));
        return out;
    }

    private static Map<String, Object> emptyValues() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("selected", List.of(List.of(), List.of(), List.of(), List.of()));
        out.put("ranked", List.of());
        return out;
    }

    private Map<String, Object> metadata(Map<String, Object> row) {
        Long activeSeconds = row.get("active_seconds") == null ? null : ((Number) row.get("active_seconds")).longValue();
        return AssessmentSupport.reportMetadata((String) row.get("profile_cipher"), String.valueOf(row.get("tenant_id")),
            activeSeconds, Boolean.TRUE.equals(row.get("profile_required")), contactKey());
    }

    private byte[] contactKey() {
        return InviteAdminController.hexToBytes(properties.getContactKey());
    }

    // ------------------------------------------------------------- consent
    @PostMapping("/api/v1/public/assessment/consent")
    public Map<String, Object> consent(@RequestBody(required = false) Map<String, Object> body) throws Exception {
        String token = requireToken(body, false);
        String pin = pinOf(body);
        String consentVersion = InviteAdminController.strOf(body, "consent_version");
        JsonNode profile = null;
        Object rawProfile = body == null ? null : body.get("profile");
        if (rawProfile != null) profile = MAPPER.valueToTree(rawProfile);
        Map<String, Object> parsedProfile = profile == null ? null : AssessmentSupport.parseProfile(profile);
        Map<String, Object> row = lookup(token, pin, false);
        if (Boolean.TRUE.equals(row.get("profile_required")) && (parsedProfile == null || parsedProfile.get("name") == null))
            throw new ApiError(400, "PROFILE_REQUIRED", "请填写本人姓名、手机号码和出生日期");
        Map<String, Object> pkg = pkgOf(row.get("package"));
        if (consentVersion == null || !consentVersion.equals(pkg.get("consent_version")))
            throw new ApiError(400, "INVALID_CONSENT_VERSION", "请阅读本次邀请对应的说明后确认");
        Map<String, Object> metadataOut = db.tx(tx -> {
            Map<String, Object> locked = txLookup(tx, token, pin);
            if (locked.get("submitted_at") != null) throw new ApiError(409, "ALREADY_SUBMITTED", "已提交的资料不可修改");
            String cipher = parsedProfile != null
                ? Crypto.encryptContact(AssessmentSupport.profileJson(parsedProfile), contactKey(), String.valueOf(locked.get("tenant_id")))
                : (String) locked.get("profile_cipher");
            tx.query("UPDATE assessment_invites SET consent_at=coalesce(consent_at,now()),profile_cipher=$2,active_seconds=coalesce(active_seconds,0),timing_updated_at=coalesce(timing_updated_at,now()) WHERE id=$1",
                locked.get("id"), cipher);
            Map<String, Object> updated = new LinkedHashMap<>(locked);
            updated.put("profile_cipher", cipher);
            if (updated.get("active_seconds") == null) updated.put("active_seconds", 0L);
            return AssessmentSupport.reportMetadata(cipher, String.valueOf(locked.get("tenant_id")),
                ((Number) updated.get("active_seconds")).longValue(), Boolean.TRUE.equals(locked.get("profile_required")), contactKey());
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("consented", true);
        out.put("metadata", metadataOut);
        return out;
    }

    private Map<String, Object> txLookup(Db tx, String token, String pin) throws Exception {
        inviteLimit(false);
        String hash = Crypto.digest(token);
        List<Map<String, Object>> rows = tx.query(
            "SELECT i.*,coalesce(c.name,'独立测评') AS name FROM assessment_invites i " + ARCHIVE_JOIN
                + " WHERE i.token_hash=$1 AND (i.pin_required=false OR i.pin_hash=$2) AND i.revoked_at IS NULL"
                + " AND i.expires_at>now() AND NOT EXISTS(SELECT 1 FROM assessment_public_entries e WHERE e.token_hash=i.token_hash)"
                + " AND " + RETAINED + " FOR UPDATE OF i",
            hash, Crypto.digest(hash + ":" + (pin == null ? "" : pin)));
        if (rows.isEmpty()) { inviteLimit(true); throw InviteAdminController.inviteMissing(); }
        return rows.get(0);
    }

    // ------------------------------------------------------------- save / submit
    @PostMapping("/api/v1/public/assessment/save")
    public Map<String, Object> save(@RequestBody(required = false) Map<String, Object> body) throws Exception {
        return saveOrSubmit(body, false);
    }

    @PostMapping("/api/v1/public/assessment/submit")
    public Map<String, Object> submit(@RequestBody(required = false) Map<String, Object> body) throws Exception {
        return saveOrSubmit(body, true);
    }

    private Map<String, Object> saveOrSubmit(Map<String, Object> body, boolean submit) throws Exception {
        String token = requireToken(body, false);
        String pin = pinOf(body);
        Long revision = longField(body, "revision");
        Object answersRaw = body == null ? null : body.get("answers");
        Map<String, Long> answers = new LinkedHashMap<>();
        if (answersRaw instanceof Map<?, ?> m) {
            for (Map.Entry<?, ?> e : m.entrySet()) answers.put(String.valueOf(e.getKey()), ((Number) e.getValue()).longValue());
        }
        List<List<String>> selected = null;
        List<String> ranked = null;
        if (body != null && body.get("value_draft") instanceof Map<?, ?> vd) {
            selected = new ArrayList<>();
            Object sel = vd.get("selected");
            if (sel instanceof List<?> groups) {
                for (Object g : groups) {
                    List<String> group = new ArrayList<>();
                    for (Object id : (List<?>) g) group.add(String.valueOf(id));
                    selected.add(group);
                }
            }
            ranked = new ArrayList<>();
            if (vd.get("ranked") instanceof List<?> r) for (Object id : r) ranked.add(String.valueOf(id));
        }
        Long activeSeconds = longField(body, "active_seconds");

        final List<List<String>> selectedIn = selected;
        final List<String> rankedIn = ranked;
        return db.tx(tx -> {
            Map<String, Object> row = txLookup(tx, token, pin);
            Map<String, Object> pkg = pkgOf(row.get("package"));
            Map<String, Object> meta = metadata(row);
            if (Boolean.TRUE.equals(row.get("profile_required")) && !Boolean.TRUE.equals(meta.get("profile_completed")))
                throw new ApiError(409, "PROFILE_REQUIRED", "请先填写本人资料");
            if (row.get("consent_at") == null) throw new ApiError(409, "CONSENT_REQUIRED", "请先阅读并同意说明");
            // complete draft validation (277 answers 1-5 + 8选5×4组、20排10)
            final List<List<String>> effectiveSelected = selectedIn != null ? selectedIn
                : (row.get("value_draft") == null ? emptySelected() : selectedOf(row.get("value_draft")));
            final List<String> effectiveRanked = rankedIn != null ? rankedIn
                : (row.get("value_draft") == null ? List.of() : rankedOf(row.get("value_draft")));
            if (submit) validateCompleteDraft(pkg, answers, effectiveSelected, effectiveRanked);
            // answer hash — TS: sorted entries; values path nests selected(grouped sorted)+ranked
            final String hash = answerHash(pkg, answers, effectiveSelected, effectiveRanked);
            if (row.get("submitted_at") != null) {
                if (submit && String.valueOf(row.get("answer_hash")).equals(hash)) {
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("revision", row.get("revision"));
                    out.put("report", row.get("report") == null ? null : jsonOf(row.get("report")));
                    out.put("submitted", true);
                    out.put("metadata", meta);
                    out.put("submitted_at", row.get("submitted_at"));
                    return out;
                }
                throw new ApiError(409, "ALREADY_SUBMITTED", "已提交的答卷不可修改");
            }
            if (revision == null || revision != ((Number) row.get("revision")).longValue())
                throw new ApiError(409, "DRAFT_CONFLICT", "另一页面已保存新版本，请重新进入后继续；当前答案未覆盖服务器");
            if (submit && !engine.ready())
                throw new ApiError(503, "INVITE_RULES_UNAVAILABLE", "本次邀请对应的固定测评规则暂不可用，未提交；答案仍可保存，请联系邀请人。");
            Map<String, Object> report = submit && isGh(pkg)
                ? engine.engine().scoreInvite(intAnswers(answers), effectiveSelected, effectiveRanked)
                : null;
            Long elapsed = AssessmentSupport.boundedActiveSeconds(
                row.get("active_seconds") == null ? null : ((Number) row.get("active_seconds")).longValue(),
                activeSeconds, row.get("timing_updated_at") == null ? null : String.valueOf(row.get("timing_updated_at")),
                System.currentTimeMillis());
            Map<String, Object> valueDraftJson = effectiveSelected == null ? null : emptyValuesDraft(effectiveSelected, effectiveRanked);
            tx.query("UPDATE assessment_invites SET active_seconds=$8,timing_updated_at=now(),answers=$2,revision=revision+1,report=$3,answer_hash=$4,submitted_at=CASE WHEN $5 THEN now() ELSE NULL END,value_draft=$6,ui_progress=coalesce($7,ui_progress) WHERE id=$1",
                row.get("id"), JsJson.stringify(answersAsMap(answers)), report == null ? null : JsJson.stringify(report),
                submit ? hash : null, submit, valueDraftJson == null ? null : JsJson.stringify(valueDraftJson), null, elapsed);
            if (submit) tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), row.get("tenant_id"), row.get("created_by"), "assessment.public_submitted", row.get("id"));
            List<Map<String, Object>> saved = tx.query("SELECT submitted_at FROM assessment_invites WHERE id=$1", row.get("id"));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("revision", ((Number) row.get("revision")).longValue() + 1);
            out.put("report", report);
            out.put("submitted", submit);
            Map<String, Object> updatedRow = new LinkedHashMap<>(row);
            updatedRow.put("active_seconds", elapsed == null ? 0L : elapsed);
            out.put("metadata", AssessmentSupport.reportMetadata((String) row.get("profile_cipher"), String.valueOf(row.get("tenant_id")),
                elapsed, Boolean.TRUE.equals(row.get("profile_required")), contactKey()));
            out.put("submitted_at", saved.get(0).get("submitted_at"));
            return out;
        });
    }


    private static String answerHash(Map<String, Object> pkg, Map<String, Long> answers,
                                     List<List<String>> selected, List<String> ranked) {
        TreeMap<String, Long> sorted = new TreeMap<>(answers);
        if (isGh(pkg)) {
            Map<String, Object> h = new LinkedHashMap<>();
            List<List<String>> entries = new ArrayList<>();
            for (Map.Entry<String, Long> e : sorted.entrySet()) entries.add(List.of(e.getKey(), String.valueOf(e.getValue())));
            h.put("answers", entries);
            List<List<String>> sortedGroups = new ArrayList<>();
            for (List<String> g : selected) { List<String> copy = new ArrayList<>(g); copy.sort(null); sortedGroups.add(copy); }
            h.put("selected", sortedGroups);
            h.put("ranked", new ArrayList<>(ranked));
            return Crypto.digest(JsJson.stringify(h));
        }
        List<List<String>> entries = new ArrayList<>();
        for (Map.Entry<String, Long> e : sorted.entrySet()) entries.add(List.of(e.getKey(), String.valueOf(e.getValue())));
        return Crypto.digest(JsJson.stringify(entries));
    }

    private static Map<String, Integer> intAnswers(Map<String, Long> answers) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : answers.entrySet()) out.put(e.getKey(), e.getValue().intValue());
        return out;
    }

    private static Map<String, Object> answersAsMap(Map<String, Long> answers) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : answers.entrySet()) out.put(e.getKey(), e.getValue());
        return out;
    }

    private static Map<String, Object> emptyValuesDraft(List<List<String>> selected, List<String> ranked) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("selected", selected);
        out.put("ranked", ranked);
        return out;
    }

    private static List<List<String>> emptySelected() { return List.of(List.of(), List.of(), List.of(), List.of()); }

    @SuppressWarnings("unchecked")
    private static List<List<String>> selectedOf(Object raw) throws Exception {
        Map<String, Object> draft = jsonOf(raw);
        List<List<String>> out = new ArrayList<>();
        for (Object g : (List<Object>) draft.get("selected")) {
            List<String> group = new ArrayList<>();
            for (Object id : (List<Object>) g) group.add(String.valueOf(id));
            out.add(group);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static List<String> rankedOf(Object raw) throws Exception {
        Map<String, Object> draft = jsonOf(raw);
        List<String> out = new ArrayList<>();
        for (Object id : (List<Object>) draft.get("ranked")) out.add(String.valueOf(id));
        return out;
    }

    private void validateCompleteDraft(Map<String, Object> pkg, Map<String, Long> answers, List<List<String>> selected, List<String> ranked) {
        List<Map<String, Object>> questions = CatalogJson.questions(pkg);
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (Map<String, Object> q : questions) ids.add(String.valueOf(q.get("id")));
        if (answers.size() != 277 || !ids.containsAll(answers.keySet()))
            throw new ApiError(400, "INVALID_ANSWERS", "请答完本版本277题，每题选择一个选项。");
        for (long v : answers.values()) if (v < 1 || v > 5) throw new ApiError(400, "INVALID_ANSWERS", "请答完本版本277题，每题选择一个选项。");
        List<List<String>> groups = CatalogJson.valueGroups(pkg);
        java.util.Set<String> flat = new java.util.LinkedHashSet<>();
        for (int i = 0; i < 4; i++) {
            List<String> group = selected.get(i);
            if (group.size() != 5 || new java.util.HashSet<>(group).size() != 5
                || !groups.get(i).containsAll(group))
                throw new ApiError(400, "INVALID_ANSWERS", "每组须从本组8个词中选5个不同词。");
            flat.addAll(group);
        }
        if (ranked.size() != 10 || new java.util.HashSet<>(ranked).size() != 10 || !flat.containsAll(ranked))
            throw new ApiError(400, "INVALID_ANSWERS", "最后10个排序词须来自前两步的选择。");
    }

    // ------------------------------------------------------------- shared entry public
    @PostMapping("/api/v1/public/assessment/entry/open")
    public Map<String, Object> entryOpen(@RequestBody(required = false) Map<String, Object> body) throws Exception {
        entryLimit();
        String token = requireToken(body, true);
        Map<String, Object> row = entryLookup(token, false);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("title", row.get("title"));
        out.put("purpose", row.get("purpose"));
        out.put("expires_at", row.get("expires_at"));
        out.put("consent_version", enrollmentPackage(row).get("consent_version"));
        return out;
    }

    @PostMapping("/api/v1/public/assessment/entry/enroll")
    public ResponseEntity<Map<String, Object>> entryEnroll(@RequestBody(required = false) Map<String, Object> body) throws Exception {
        entryLimit();
        String token = requireToken(body, true);
        String participantKey = InviteAdminController.strOf(body, "participant_key");
        String consentVersion = InviteAdminController.strOf(body, "consent_version");
        if (participantKey == null || !participantKey.matches("^[A-Za-z0-9_-]{43}$")
            || consentVersion == null || consentVersion.length() > 100
            || body == null || !Boolean.TRUE.equals(body.get("accepted")))
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确", List.of(Map.of("path",
                participantKey == null || !participantKey.matches("^[A-Za-z0-9_-]{43}$") ? "participant_key"
                : consentVersion == null || consentVersion.length() > 100 ? "consent_version" : "accepted", "message", "dbg")));
        if (token == null || !(token.matches("^[A-Za-z0-9_-]{22}$") || (token.length() >= 32 && token.length() <= 128)))
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确", List.of(Map.of("path", "token", "message", "dbg")));
        JsonNode profileNode = body.get("profile") == null ? null : MAPPER.valueToTree(body.get("profile"));
        Map<String, Object> profile = profileNode == null ? null : AssessmentSupport.parseProfile(profileNode);
        if (profile == null || profile.get("name") == null) throw new ApiError(400, "INVALID_INPUT", "输入格式不正确");

        Map<String, Object> data = db.tx(tx -> {
            Map<String, Object> row = entryLookupTx(tx, token);
            Map<String, Object> pkg = enrollmentPackage(row);
            if (!consentVersion.equals(pkg.get("consent_version")))
                throw new ApiError(400, "INVALID_CONSENT_VERSION", "请阅读对应版本说明");
            if (!engine.ready())
                throw new ApiError(503, "ENTRY_RULES_UNAVAILABLE", "本入口对应的测评规则暂不可用");
            String hash = Crypto.digest(participantKey);
            if (!tx.query("SELECT id FROM assessment_public_entries WHERE token_hash=$1", hash).isEmpty())
                throw InviteAdminController.entryUnavailable();
            List<Map<String, Object>> priorRows = tx.query(
                "SELECT id,public_entry_id,tenant_id,revoked_at,expires_at,independent_retention_until,profile_cipher,pin_required FROM assessment_invites WHERE token_hash=$1", hash);
            if (!priorRows.isEmpty()) {
                Map<String, Object> prior = priorRows.get(0);
                if (!String.valueOf(prior.get("public_entry_id")).equals(String.valueOf(row.get("id")))
                    || !String.valueOf(prior.get("tenant_id")).equals(String.valueOf(row.get("tenant_id")))
                    || prior.get("revoked_at") != null
                    || Instant.parse(String.valueOf(prior.get("expires_at"))).toEpochMilli() <= System.currentTimeMillis()
                    || Instant.parse(String.valueOf(prior.get("independent_retention_until"))).toEpochMilli() <= System.currentTimeMillis())
                    throw InviteAdminController.entryUnavailable();
                String priorProfileJson = Crypto.decryptContact(String.valueOf(prior.get("profile_cipher")), contactKey(), String.valueOf(row.get("tenant_id")));
                if (!profileJsonOf(priorProfileJson).equals(AssessmentSupport.profileJson(profile)))
                    throw new ApiError(409, "PARTICIPANT_CONFLICT", "登记资料已变化，请选择另一位参与者重新登记");
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("token", participantKey);
                if (Boolean.TRUE.equals(prior.get("pin_required")))
                    out.put("pin", AssessmentSupport.entryPin(contactKey(), String.valueOf(row.get("id")), participantKey));
                return out;
            }
            String id = UUID.randomUUID().toString();
            // legacy snapshot: stringify of the package AS READ FROM THE ENTRY ROW —
            // jsonb has normalized its key order, and the hash covers that canonical form
            String snapshot = JsJson.stringify(pkg);
            tx.query("INSERT INTO assessment_invites(id,tenant_id,candidate_id,token_hash,pin_hash,package,package_hash,purpose,expires_at,created_by,participant_kind,project_group_id,profile_required,independent_retention_until,public_entry_id,profile_cipher,consent_at,active_seconds,timing_updated_at,pin_required) VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,'external',$10,true,now()+interval '365 days',$11,$12,now(),0,now(),false)",
                id, row.get("tenant_id"), hash, Crypto.digest(Crypto.randomToken()), snapshot, Crypto.digest(snapshot),
                row.get("purpose"), row.get("expires_at"), row.get("created_by"), row.get("project_group_id"), row.get("id"),
                Crypto.encryptContact(AssessmentSupport.profileJson(profile), contactKey(), String.valueOf(row.get("tenant_id"))));
            tx.query("INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)",
                UUID.randomUUID().toString(), row.get("tenant_id"), row.get("created_by"), "assessment.public_entry_enrolled", id);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("token", participantKey);
            return out;
        });
        return ResponseEntity.status(HttpStatus.CREATED).body(data);
    }

    private String modelFileHash() throws Exception {
        return EngineRuntime.sha256Hex(java.nio.file.Files.readString(
            java.nio.file.Path.of(properties.getEngineModelFile()), java.nio.charset.StandardCharsets.UTF_8));
    }

    private static String profileJsonOf(String json) throws Exception {
        Map<String, Object> parsed = CatalogJson.parse(json);
        Map<String, Object> ordered = new LinkedHashMap<>();
        if (parsed.containsKey("name")) ordered.put("name", parsed.get("name"));
        ordered.put("phone", parsed.get("phone"));
        ordered.put("birth_date", parsed.get("birth_date"));
        return AssessmentSupport.profileJson(ordered);
    }

    private Map<String, Object> enrollmentPackage(Map<String, Object> row) throws Exception {
        if (row.get("legacy_invite_id") != null) {
            if (!engine.ready()) throw new ApiError(503, "ENTRY_RULES_UNAVAILABLE", "测评服务暂不可用");
            return engine.engine().standardPackage(modelFileHash());
        }
        return jsonOf(row.get("package"));
    }

    private Map<String, Object> entryLookup(String token, boolean lock) throws Exception {
        return entryLookupOn(db, token, lock);
    }

    private Map<String, Object> entryLookupTx(Db tx, String token) throws Exception {
        return entryLookupOn(tx, token, true);
    }

    private static Map<String, Object> entryLookupOn(Db db, String token, boolean lock) throws Exception {
        List<Map<String, Object>> rows = db.query(
            "SELECT e.* FROM assessment_public_entries e WHERE (e.token_hash=$1 OR e.id IN (SELECT i.public_entry_id FROM assessment_invites i WHERE i.token_hash=$1 AND i.pin_required=true AND i.revoked_at IS NULL AND i.expires_at>now() AND i.independent_retention_until>now())) AND e.revoked_at IS NULL AND e.expires_at>now()"
                + (lock ? " FOR UPDATE OF e" : ""),
            Crypto.digest(token));
        if (rows.isEmpty()) throw InviteAdminController.entryUnavailable();
        return rows.get(0);
    }

    // ------------------------------------------------------------- input helpers
    private String requireToken(Map<String, Object> body, boolean entryAuth) {
        String token = InviteAdminController.strOf(body, "token");
        if (entryAuth) {
            if (token == null || !(token.matches("^[A-Za-z0-9_-]{22}$") || (token.length() >= 32 && token.length() <= 128)))
                throw invalidInput();
        } else if (token == null || token.length() < 32 || token.length() > 128) {
            throw new ApiError(400, "INVALID_INPUT", "输入格式不正确", List.of(
                Map.of("path", "token", "message", "Too small: expected string to have >=32 characters")));
        }
        return token;
    }

    private static ApiError invalidInput() { return new ApiError(400, "INVALID_INPUT", "输入格式不正确"); }

    private String pinOf(Map<String, Object> body) {
        String pin = InviteAdminController.strOf(body, "pin");
        if (pin != null && !pin.matches("^\\d{6}$")) throw invalidInput();
        return pin;
    }

    private static Long longField(Map<String, Object> body, String key) {
        if (body == null) return null;
        Object v = body.get(key);
        return v instanceof Number n ? n.longValue() : null;
    }
}
