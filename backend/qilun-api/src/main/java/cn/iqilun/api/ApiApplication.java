package cn.iqilun.api;

import cn.iqilun.common.Db;
import cn.iqilun.common.Migrations;
import cn.iqilun.common.PgDb;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/**
 * Java rewrite of the qilun talent API. R1 skeleton: shared-migration bootstrap,
 * legacy-parity session auth and the health/auth endpoint group, springdoc
 * OpenAPI. Endpoint parity is gated by tools/parity/differ.mjs against the
 * legacy system.
 */
@SpringBootApplication
@EnableConfigurationProperties(ApiProperties.class)
public class ApiApplication {

    public static void main(String[] args) throws Exception {
        SpringApplication app = new SpringApplication(ApiApplication.class);
        app.run(args);
    }

    @Bean
    public Db database(ApiProperties properties) throws Exception {
        Db db = new PgDb(properties.getDatabaseUrl());
        Migrations.apply(db, Path.of(properties.getMigrationsDir()).toAbsolutePath().normalize());
        if ("1".equals(System.getenv("QILUN_PARITY_SEED"))) paritySeed(db);
        return db;
    }

    /**
     * Differ-mode seeding: identical fixed tenant/admin as the legacy boot path
     * in tools/parity/differ.mjs, so both systems answer the scenario suite
     * with the same data. Local/differ use only.
     */
    private static void paritySeed(Db db) throws Exception {
        List<Map<String, Object>> existing = db.query("SELECT count(*)::int AS n FROM staff_users");
        if (((Number) existing.get(0).get("n")).intValue() > 0) return;
        db.query("INSERT INTO tenants(id,name) VALUES($1,$2)", "00000000-0000-4000-8000-000000000001", "parity");
        db.query("INSERT INTO staff_users(id,tenant_id,username,password_hash,role) VALUES($1,$2,$3,$4,$5)",
            "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001", "local-admin",
            cn.iqilun.common.Crypto.hashPassword("Parity!Fixed-2026"), "talent_lead");
    }
}
