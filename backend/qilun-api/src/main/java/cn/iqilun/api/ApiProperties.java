package cn.iqilun.api;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "qilun")
public class ApiProperties {
    /** JDBC url of the PostgreSQL database (PG16 drill/staging/production). */
    private String databaseUrl = "jdbc:postgresql://127.0.0.1:54329/qilun_java";
    /** Shared migration directory, lock-stepped with the legacy system. */
    private String migrationsDir = "infra/migrations";
    /** Public origin; used for the Origin guard exactly like the legacy config.origin. */
    private String origin = "http://127.0.0.1:43131";
    private boolean production = false;
    /** 64-hex CONTACT_ENCRYPTION_KEY equivalent. */
    private String contactKey = "";
    /** Frozen inverse model file (hash-locked against the rulebook at boot). */
    private String engineModelFile = ".local/gh-inference-v1/model.json";

    public String getDatabaseUrl() { return databaseUrl; }
    public void setDatabaseUrl(String v) { this.databaseUrl = v; }
    public String getMigrationsDir() { return migrationsDir; }
    public void setMigrationsDir(String v) { this.migrationsDir = v; }
    public String getOrigin() { return origin; }
    public void setOrigin(String v) { this.origin = v; }
    public boolean isProduction() { return production; }
    public void setProduction(boolean v) { this.production = v; }
    public String getContactKey() { return contactKey; }
    public void setContactKey(String v) { this.contactKey = v; }
    public String getEngineModelFile() { return engineModelFile; }
    public void setEngineModelFile(String v) { this.engineModelFile = v; }
}
