package cn.iqilun.common;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * Cross-language crypto regression against golden vectors produced by the
 * legacy TS implementation (regenerate with tools/crosstest/run.mjs when the
 * sample is refreshed). Mirrors the four crosstest assertions.
 */
class CryptoParityTest {

    @Test
    void legacyVectorsRoundTrip() throws Exception {
        String json = Files.readString(Path.of("..", "..", "tools", "crosstest", "vectors.sample.json"), StandardCharsets.UTF_8);
        String keyHex = field(json, "key_hex"), tenant = field(json, "tenant"), plaintext = field(json, "plaintext");
        byte[] key = unhex(keyHex);

        assertEquals(plaintext, Crypto.decryptContact(field(json, "ciphertext"), key, tenant), "TS->Java AES-GCM decrypt");
        assertTrue(Crypto.verifyPassword(field(json, "password"), field(json, "saved_hash")), "scrypt hash verify");

        String javaCiphertext = Crypto.encryptContact(plaintext, key, tenant);
        assertEquals(plaintext, Crypto.decryptContact(javaCiphertext, key, tenant), "Java round-trip");

        assertThrows(Exception.class, () -> Crypto.decryptContact(javaCiphertext, key, "00000000-0000-0000-0000-000000000000"), "wrong-tenant AAD must be rejected");
    }

    @Test
    void digestIsHexSha256() {
        assertEquals("2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae", Crypto.digest("foo"));
    }

    @Test
    void placeholderRewriteSkipsStringLiterals() {
        Placeholders.Translated t = Placeholders.toJdbc("SELECT a FROM t WHERE x=$1 AND y='a$1b' AND z=$2");
        assertEquals("SELECT a FROM t WHERE x=? AND y='a$1b' AND z=?", t.jdbc());
        assertArrayEquals(new int[]{1, 2}, t.paramIndex());
        Placeholders.Translated repeated = Placeholders.toJdbc("SELECT $1,$1 FROM t WHERE id=$2 OR pid=$1");
        assertArrayEquals(new int[]{1, 1, 2, 1}, repeated.paramIndex());
    }

    private static String field(String json, String name) {
        int i = json.indexOf("\"" + name + "\": \"");
        if (i < 0) throw new IllegalArgumentException("field " + name);
        int start = i + name.length() + 5, end = json.indexOf('"', start);
        return json.substring(start, end);
    }

    private static byte[] unhex(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(hex.substring(2 * i, 2 * i + 2), 16);
        return out;
    }
}
