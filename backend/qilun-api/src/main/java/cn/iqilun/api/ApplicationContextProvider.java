package cn.iqilun.api;

import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;

/** Static access to Spring beans from non-Spring helper classes. */
@Component
public class ApplicationContextProvider implements ApplicationContextAware {

    private static ApplicationContext context;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) {
        context = applicationContext;
    }

    public static ApiProperties properties() {
        return context.getBean(ApiProperties.class);
    }

    public static <T> T bean(Class<T> type) {
        return context.getBean(type);
    }
}
