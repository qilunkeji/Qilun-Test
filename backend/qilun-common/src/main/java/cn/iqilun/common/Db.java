package cn.iqilun.common;

import java.util.List;
import java.util.Map;

/**
 * Driver-agnostic database surface mirroring the legacy TS Database contract:
 * parameterized query, multi-statement exec, callback transactions, close.
 * Implementations serialize access on one connection, matching the legacy
 * embedded-PGlite single-connection semantics (parity guarantee for R2).
 */
public interface Db extends AutoCloseable {
    List<Map<String, Object>> query(String sql, Object... params) throws Exception;

    /** Multi-statement simple query (migration files run as one unit). */
    void exec(String sql) throws Exception;

    /** BEGIN ... COMMIT/ROLLBACK; the body sees the same connection and lock. */
    <T> T tx(TxBody<T> body) throws Exception;

    void close() throws Exception;

    @FunctionalInterface
    interface TxBody<T> {
        T run(Db tx) throws Exception;
    }
}
