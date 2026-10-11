package cn.iqilun.api;

/** Bridge for controllers that cannot inject AgentMcpController directly. */
public final class ApplicationContextHolderHolder {
    private ApplicationContextHolderHolder() {}

    public static Object queueStatus(String tenant) {
        try {
            return ApplicationContextProvider.bean(AgentMcpController.class).queueStatusFor(tenant);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
