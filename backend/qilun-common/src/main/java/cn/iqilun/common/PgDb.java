package cn.iqilun.common;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Single-connection PostgreSQL implementation of {@link Db}.
 *
 * One connection + one lock reproduces the legacy embedded-PGlite execution
 * model exactly (queries strictly serialized, transactions never interleave),
 * which keeps R2 endpoint parity deterministic. Multi-instance pooling is a
 * deliberate R4 concern.
 */
public final class PgDb implements Db, AutoCloseable {
    private final Connection connection;
    private final ReentrantLock lock = new ReentrantLock();

    public PgDb(String jdbcUrl) throws Exception {
        this.connection = DriverManager.getConnection(jdbcUrl);
        this.connection.setAutoCommit(true);
    }

    @Override
    public List<Map<String, Object>> query(String sql, Object... params) throws Exception {
        lock.lock();
        try {
            Placeholders.Translated translated = Placeholders.toJdbc(sql);
            try (PreparedStatement ps = connection.prepareStatement(translated.jdbc())) {
                // each '?' maps back to its $N; repeated $N re-binds the same value (legacy driver semantics)
                for (int i = 0; i < translated.paramIndex().length; i++) {
                    bindOne(ps, i + 1, params[translated.paramIndex()[i] - 1]);
                }
                // legacy db.query() also serves INSERT/UPDATE (PGlite returns no rows); mirror that
                boolean hasResultSet = ps.execute();
                List<Map<String, Object>> rows = new ArrayList<>();
                if (hasResultSet) {
                    try (ResultSet rs = ps.getResultSet()) {
                        ResultSetMetaData meta = rs.getMetaData();
                        while (rs.next()) {
                            Map<String, Object> row = new LinkedHashMap<>();
                            for (int i = 1; i <= meta.getColumnCount(); i++) {
                                Object value = rs.getObject(i);
                                row.put(meta.getColumnLabel(i), value == null ? null : JdbcValues.normalize(value));
                            }
                            rows.add(row);
                        }
                    }
                }
                return rows;
            }
        } finally {
            lock.unlock();
        }
    }

    @Override
    public void exec(String sql) throws Exception {
        lock.lock();
        try (Statement statement = connection.createStatement()) {
            statement.execute(sql);
        } finally {
            lock.unlock();
        }
    }

    @Override
    public <T> T tx(TxBody<T> body) throws Exception {
        lock.lock();
        try {
            connection.setAutoCommit(false);
            try {
                T out = body.run(this);
                connection.commit();
                return out;
            } catch (Exception e) {
                connection.rollback();
                throw e;
            } finally {
                connection.setAutoCommit(true);
            }
        } finally {
            lock.unlock();
        }
    }

    @Override
    public void close() throws Exception {
        lock.lock();
        try {
            connection.close();
        } finally {
            lock.unlock();
        }
    }

    private static void bindOne(PreparedStatement ps, int position, Object value) throws Exception {
        if (value instanceof String) {
            // send as unspecified type so the server casts varchar->uuid/timestamp like the legacy driver
            ps.setObject(position, value, java.sql.Types.OTHER);
        } else {
            ps.setObject(position, value);
        }
    }
}
