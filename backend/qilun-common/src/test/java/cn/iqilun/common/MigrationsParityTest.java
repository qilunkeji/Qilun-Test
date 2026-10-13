package cn.iqilun.common;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

class MigrationsParityTest {

    private static final String PG_URL = System.getenv().getOrDefault("QILUN_TEST_PG", "jdbc:postgresql://127.0.0.1:54329/postgres?user=qilun");

    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }

    @Test
    void migrationsApplyAndChecksumsLock() throws Exception {
        String dbName = "qilun_java_test_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection ignored = DriverManager.getConnection(PG_URL)) {
            // connectivity probe
        } catch (Exception e) {
            Assumptions.assumeTrue(false, "local PG unavailable: " + e.getMessage());
            return;
        }
        try (Connection admin = DriverManager.getConnection(PG_URL); Statement st = admin.createStatement()) {
            st.execute("CREATE DATABASE " + dbName);
        }
        try {
            try (Db db = new PgDb(deriveTestUrl(PG_URL, dbName))) {
                Migrations.apply(db, Path.of("..", "..", "infra", "migrations"));
                List<Map<String, Object>> rows = db.query("SELECT version, checksum FROM schema_migrations ORDER BY version");
                assertEquals(15, rows.size(), "all 15 shared migrations applied");
                List<Migrations.Entry> entries = Migrations.discover(Path.of("..", "..", "infra", "migrations"));
                for (int i = 0; i < entries.size(); i++) {
                    assertEquals(entries.get(i).version(), ((Number) rows.get(i).get("version")).intValue());
                    String expected = Migrations.sha256(Files.readString(entries.get(i).file(), StandardCharsets.UTF_8).getBytes(StandardCharsets.UTF_8));
                    assertEquals(expected, rows.get(i).get("checksum"), "checksum lock for " + entries.get(i).file().getFileName());
                }
            }
        } finally {
            try (Connection admin = DriverManager.getConnection(PG_URL); Statement st = admin.createStatement()) {
                st.execute("DROP DATABASE IF EXISTS " + dbName + " WITH (FORCE)");
            }
        }
    }
}
