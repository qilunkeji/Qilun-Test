package cn.iqilun.common;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;

/**
 * Checksum-locked migration runner, a byte-exact port of the legacy TS runner
 * (apps/api/db.ts): same algorithm, same sha256(file bytes) checksums, same
 * immutability rule. The 001-015 SQL files are shared verbatim with the legacy
 * system (infra/migrations) — both sides stay schema-locked together.
 */
public final class Migrations {
    private Migrations() {}

    public static void apply(Db db, Path migrationsDir) throws Exception {
        db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
        for (Entry entry : discover(migrationsDir)) {
            String sql = Files.readString(entry.file(), StandardCharsets.UTF_8);
            String checksum = sha256(sql.getBytes(StandardCharsets.UTF_8));
            List<java.util.Map<String, Object>> prior = db.query("SELECT checksum FROM schema_migrations WHERE version=$1", entry.version());
            if (!prior.isEmpty() && !checksum.equals(prior.get(0).get("checksum"))) {
                throw new IllegalStateException("Migration checksum mismatch for " + entry.file().getFileName());
            }
            if (prior.isEmpty()) {
                db.tx(tx -> {
                    tx.exec(sql);
                    tx.query("INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)", entry.version(), checksum);
                    return null;
                });
            }
        }
    }

    /** Discovers NNN_name.sql files ordered by version prefix; 016+ files are picked up automatically on both systems. */
    public static List<Entry> discover(Path dir) throws IOException {
        List<Entry> entries = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.sql")) {
            for (Path file : stream) {
                String name = file.getFileName().toString();
                int underscore = name.indexOf('_');
                if (underscore <= 0) continue;
                entries.add(new Entry(Integer.parseInt(name.substring(0, underscore)), file));
            }
        }
        entries.sort(Comparator.comparingInt(Entry::version));
        return entries;
    }

    static String sha256(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(digest.digest(bytes));
    }

    public record Entry(int version, Path file) {}
}
