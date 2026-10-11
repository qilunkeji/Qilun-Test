package cn.iqilun.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** ai/meta from apps/api/ai-routes.ts:25 — role gate + mode-dependent static payload. */
@RestController
public class AiMetaController {

    @GetMapping("/api/v1/ai/meta")
    public Map<String, Object> meta(HttpServletRequest request) {
        GuardsFilter.Auth auth = (GuardsFilter.Auth) request.getAttribute(GuardsFilter.AUTH);
        if (!List.of("talent_lead", "hr").contains(auth.role()))
            throw new ApiError(403, "FORBIDDEN_SCOPE", "当前角色无此权限");
        boolean externalAgent = "external_agent".equals(System.getenv("PROCESSING_MODE"));
        boolean agentConfigured = System.getenv("AGENT_WRITE_TOKEN_SHA256") != null
            && System.getenv("AGENT_WRITE_TOKEN_SHA256").matches("(?i)^[a-f0-9]{64}$");
        String replyHint = System.getenv("AGENT_REPLY_HINT_TEXT");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", externalAgent ? "external_agent" : "model");
        out.put("processing_label", externalAgent ? "齐论 AI 助手（外部智能体）" : "已配置模型");
        out.put("consent_text", externalAgent ? "交由齐论人才系统接入的 AI 助手（外部智能体）处理" : "发送给已配置的模型供应商进行本次分析");
        out.put("reply_hint", replyHint != null ? replyHint : "通常 1–3 分钟内完成");
        out.put("agent_configured", agentConfigured);
        return out;
    }
}
