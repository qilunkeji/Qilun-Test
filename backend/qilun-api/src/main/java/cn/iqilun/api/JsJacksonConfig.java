package cn.iqilun.api;

import cn.iqilun.engine.JsNumber;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Response-body numbers must serialize like JSON.stringify: integral doubles
 * without ".0", shortest round-trip digits, ECMA exponent formatting.
 */
@Configuration
public class JsJacksonConfig {

    public static final class JsDoubleSerializer extends JsonSerializer<Double> {
        @Override
        public void serialize(Double value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
            gen.writeRawValue(JsNumber.format(value));
        }
    }

    public static final class JsFloatSerializer extends JsonSerializer<Float> {
        @Override
        public void serialize(Float value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
            gen.writeRawValue(JsNumber.format(value.doubleValue()));
        }
    }

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jsNumberCustomizer() {
        com.fasterxml.jackson.databind.module.SimpleModule module = new com.fasterxml.jackson.databind.module.SimpleModule();
        module.addSerializer(Double.class, new JsDoubleSerializer());
        module.addSerializer(Float.class, new JsFloatSerializer());
        return builder -> builder.modulesToInstall(module);
    }
}
