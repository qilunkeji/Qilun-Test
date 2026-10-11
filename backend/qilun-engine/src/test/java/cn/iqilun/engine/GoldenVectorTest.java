package cn.iqilun.engine;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/**
 * R3 acceptance gate: the Java engine must reproduce the R0 golden corpus
 * byte-exactly. Each vector's report JSON is re-serialized with JsJson (TS key
 * order + ECMA number formatting) and sha256-compared; the per-sample hashes
 * are chained exactly like tools/golden/generate.mjs and the chain head must
 * equal the committed manifest.
 *
 * Requires: tools/golden/vectors.jsonl (regenerate with the .mjs generator)
 * and .local/gh-inference-v1/model.json. Skips with a clear message otherwise.
 */
class GoldenVectorTest {

    @Test
    void goldenCorpusReproducesBitExactly() throws Exception {
        Path root = Path.of("..", "..").toAbsolutePath().normalize();
        Path vectors = root.resolve("tools/golden/vectors.jsonl");
        Path manifestFile = root.resolve("tools/golden/manifest.json");
        Path modelFile = root.resolve(".local/gh-inference-v1/model.json");
        Assumptions.assumeTrue(Files.exists(vectors), "golden vectors missing — run: node --experimental-strip-types tools/golden/generate.mjs");
        Assumptions.assumeTrue(Files.exists(modelFile), "frozen model missing — restore .local/gh-inference-v1/model.json");

        Engine engine = new Engine(new Catalog(root, modelFile));
        ObjectMapper mapper = new ObjectMapper();
        JsonNode manifest = mapper.readTree(Files.readString(manifestFile));
        String expectedHead = manifest.get("chain_head").asText();

        List<String> lines = Files.readAllLines(vectors);
        String chain = "";
        int index = 0;
        for (String line : lines) {
            if (line.isBlank()) continue;
            JsonNode sample = mapper.readTree(line);
            Map<String, Integer> answers = new LinkedHashMap<>();
            sample.get("answers").fields().forEachRemaining(e -> answers.put(e.getKey(), e.getValue().asInt()));
            List<List<String>> selected = new ArrayList<>();
            sample.get("values").get("selected").forEach(g -> {
                List<String> group = new ArrayList<>();
                g.forEach(id -> group.add(id.asText()));
                selected.add(group);
            });
            List<String> ranked = new ArrayList<>();
            sample.get("values").get("ranked").forEach(id -> ranked.add(id.asText()));

            Map<String, Object> report = engine.scoreInvite(answers, selected, ranked);
            String json = JsJson.stringify(report);
            String sha = sha256Hex(json);
            if (!sha.equals(sample.get("sha256").asText())) {
                String expectedJson = sample.get("report").asText();
                int pos = firstDiff(json, expectedJson);
                fail("vector " + index + " (pattern=" + sample.get("pattern").asText() + ") mismatch at char " + pos
                    + "\n  expected sha: " + sample.get("sha256").asText()
                    + "\n  actual   sha: " + sha
                    + "\n  expected: ..." + safeCut(expectedJson, pos)
                    + "\n  actual  : ..." + safeCut(json, pos));
            }
            chain = sha256Hex(chain + sha);
            index++;
        }
        assertEquals(expectedHead, chain, "hash chain head differs from committed manifest");
        assertEquals(manifest.get("count").asInt(), index, "vector count differs from manifest");
        assertEquals("88b5dace", chain.substring(0, 8), "R0 chain head prefix");
        System.out.println("GOLDEN_JAVA_OK vectors=" + index + " chain_head=" + chain);
    }

    static int firstDiff(String a, String b) {
        int n = Math.min(a.length(), b.length());
        for (int i = 0; i < n; i++) if (a.charAt(i) != b.charAt(i)) return i;
        return n;
    }

    static String safeCut(String s, int pos) {
        int from = Math.max(0, pos - 60);
        return s.substring(from, Math.min(s.length(), pos + 60));
    }

    static String sha256Hex(String text) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        StringBuilder sb = new StringBuilder(64);
        for (byte b : md.digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8))) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
