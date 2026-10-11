package cn.iqilun.api;

import cn.iqilun.common.Db;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Legacy-parity health endpoint. assessment.ready becomes true when the R3
 * engine port passes the golden corpus; until then it reports false, which is
 * why health is excluded from the R1 differ subset.
 */
@RestController
public class HealthController {

    private final Db db;
    private final ApiProperties properties;
    private final EngineRuntime engineRuntime;

    public HealthController(Db db, ApiProperties properties, EngineRuntime engineRuntime) {
        this.db = db;
        this.properties = properties;
        this.engineRuntime = engineRuntime;
    }

    @GetMapping("/api/v1/health")
    public Map<String, Object> health() throws Exception {
        db.query("SELECT 1");
        Map<String, Object> assessment = new LinkedHashMap<>();
        assessment.put("version", "qilun-internal-assessment/1.0.0");
        assessment.put("ready", engineRuntime.ready());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "ok");
        out.put("stage", "P2-P3");
        out.put("database", "postgresql");
        out.put("deployment", properties.isProduction() ? "single-instance-https" : "local-only");
        out.put("assessment", assessment);
        return out;
    }
}
