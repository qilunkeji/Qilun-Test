package cn.iqilun.api;

import cn.iqilun.engine.Catalog;
import cn.iqilun.engine.Engine;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Fail-closed engine loader, mirroring apps/api/assessment-product.ts: the
 * frozen model file must hash-match the rulebook lock before the engine is
 * exposed; otherwise health reports assessment.ready=false.
 */
@Component
public class EngineRuntime {

    private static final Logger log = LoggerFactory.getLogger(EngineRuntime.class);

    private final Engine engine;
    private final String modelHash;
    private final String problem;

    public EngineRuntime(ApiProperties properties) {
        Engine engine = null;
        String modelHash = null, problem = null;
        try {
            Path modelFile = Path.of(properties.getEngineModelFile()).toAbsolutePath().normalize();
            String raw = Files.readString(modelFile, StandardCharsets.UTF_8);
            String hash = sha256Hex(raw);
            Catalog catalog = new Catalog(Path.of("").toAbsolutePath().normalize(), modelFile);
            String locked = String.valueOf(catalog.rulebook.get("model_sha256"));
            if (!hash.equals(locked)) throw new IllegalStateException("STANDARD_MODEL_MISMATCH");
            engine = new Engine(catalog);
            modelHash = hash;
        } catch (Exception e) {
            problem = e.getMessage();
            log.warn("assessment engine unavailable: {}", problem);
        }
        this.engine = engine;
        this.modelHash = modelHash;
        this.problem = problem;
    }

    public boolean ready() { return engine != null; }

    public Engine engine() {
        if (engine == null) throw new IllegalStateException("STANDARD_MODEL_UNAVAILABLE");
        return engine;
    }

    public String rulesFingerprint() { return engine == null ? null : engine.rulesFingerprint; }

    static String sha256Hex(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            StringBuilder sb = new StringBuilder(64);
            for (byte b : md.digest(text.getBytes(StandardCharsets.UTF_8))) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
