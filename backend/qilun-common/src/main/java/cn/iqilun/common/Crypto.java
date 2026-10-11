package cn.iqilun.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.bouncycastle.crypto.generators.SCrypt;

/**
 * Byte-exact port of packages/security/index.ts. Cross-language compatibility
 * is regression-tested by tools/crosstest (AES-256-GCM both directions,
 * scrypt N=16384 r=8 p=1 with the hex-string-as-bytes salt quirk, AAD binding).
 */
public final class Crypto {
    private Crypto() {}

    private static final SecureRandom RANDOM = new SecureRandom();

    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** sha256 hex digest — identical output to the legacy digest() used for token hashes. */
    public static String digest(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return hex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** scrypt(password, salt, 64) with Node defaults; salt is the hex STRING's UTF-8 bytes, exactly as the legacy code passes it. */
    public static String hashPassword(String password) {
        byte[] saltHex = new byte[16];
        RANDOM.nextBytes(saltHex);
        String salt = hex(saltHex);
        return salt + ":" + hex(SCrypt.generate(password.getBytes(StandardCharsets.UTF_8), salt.getBytes(StandardCharsets.UTF_8), 16384, 8, 1, 64));
    }

    public static boolean verifyPassword(String password, String saved) {
        try {
            String[] parts = saved.split(":", 2);
            byte[] actual = SCrypt.generate(password.getBytes(StandardCharsets.UTF_8), parts[0].getBytes(StandardCharsets.UTF_8), 16384, 8, 1, 64);
            byte[] expected = unhex(parts[1]);
            if (expected.length != actual.length) return false;
            int diff = 0;
            for (int i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
            return diff == 0;
        } catch (Exception e) {
            return false;
        }
    }

    /** AES-256-GCM wire format: base64url(iv).base64url(authTag).base64url(ciphertext); AAD = tenant bytes. */
    public static String encryptContact(String value, byte[] key, String tenant) {
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(tenant.getBytes(StandardCharsets.UTF_8));
            byte[] out = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] ct = new byte[out.length - 16], tag = new byte[16];
            System.arraycopy(out, 0, ct, 0, ct.length);
            System.arraycopy(out, ct.length, tag, 0, 16);
            Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
            return b64.encodeToString(iv) + "." + b64.encodeToString(tag) + "." + b64.encodeToString(ct);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static String decryptContact(String value, byte[] key, String tenant) {
        try {
            String[] parts = value.split("\\.");
            Base64.Decoder b64 = Base64.getUrlDecoder();
            byte[] iv = b64.decode(parts[0]), tag = b64.decode(parts[1]), ct = b64.decode(parts[2]);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(tenant.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[ct.length + tag.length];
            System.arraycopy(ct, 0, out, 0, ct.length);
            System.arraycopy(tag, 0, out, ct.length, tag.length);
            return new String(cipher.doFinal(out), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalArgumentException("decrypt failed");
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static byte[] unhex(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(hex.substring(2 * i, 2 * i + 2), 16);
        return out;
    }
}
