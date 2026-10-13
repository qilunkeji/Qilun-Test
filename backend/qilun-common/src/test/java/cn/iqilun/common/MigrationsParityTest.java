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

/**
 * Runs the Java migration runner against the shared infra/migrations files on a
 * throwaway local PostgreSQL database and verifies the schema_migrations
 * lock table matches the shared file checksums (the same rows the legacy TS
 * runner produces; full TS-vs-Java schema comparison runs at the CLI gate).
 * Skips when no local PG is reachable (e.g. environments without the drill db).
 */
class MigrationsParityTest {

    private static final String PG_URL = System.getenv().getOrDefault("QILUN_TEST_PG", "jdbc:postgresql://127.0.0.1:54329/postgres?user=qilun");

    @Test
    void migrationsApplyAndChecksumsLock() throws Exception {
        String dbName = "qilun_java_test_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection admin = DriverManager.getConnection(PG_URL); Statement ignored = admin.createStatement()) {
            // connectivity probe
        
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
} catch (Exception e) {
            Assumptions.assumeTrue(false, "local PG unavailable: " + e.getMessage());
            return;
        
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
}
        try (Connection admin = DriverManager.getConnection(PG_URL); Statement st = admin.createStatement()) {
            st.execute("CREATE DATABASE " + dbName);
        
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
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
                
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
}
            
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
}
        
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
} finally {
            try (Connection admin = DriverManager.getConnection(PG_URL); Statement st = admin.createStatement()) {
                st.execute("DROP DATABASE IF EXISTS " + dbName + " WITH (FORCE)");
            
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
}
        
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
}
    
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
}

    private static void assumeNoPg(Exception e) {
        Assumptions.assumeTrue(false, "local PG unavailable: " + e.getMessage());
    
    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
}

    /** Derive a test-database JDBC URL from the maintenance URL (same host/port/user). */
    private static String deriveTestUrl(String adminUrl, String dbName) {
        return adminUrl.replaceAll("/[^/?]*$", "/" + dbName);
    }
}
