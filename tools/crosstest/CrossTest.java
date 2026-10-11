import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;

public class CrossTest {
  // Mirrors packages/security/index.ts: AES-256-GCM, 12-byte IV, AAD=tenant UTF-8,
  // output base64url(iv).base64url(authTag).base64url(ciphertext), 16-byte tag.
  static String encrypt(String value, byte[] key, String tenant) throws Exception {
    byte[] iv = new byte[12];
    new SecureRandom().nextBytes(iv);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
    cipher.updateAAD(tenant.getBytes(StandardCharsets.UTF_8));
    byte[] out = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)); // ct||tag
    byte[] ct = new byte[out.length - 16], tag = new byte[16];
    System.arraycopy(out, 0, ct, 0, ct.length);
    System.arraycopy(out, ct.length, tag, 0, 16);
    Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
    return b64.encodeToString(iv) + "." + b64.encodeToString(tag) + "." + b64.encodeToString(ct);
  }

  static String decrypt(String value, byte[] key, String tenant) throws Exception {
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
  }

  public static void main(String[] args) throws Exception {
    String json = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
    // minimal JSON field extraction (no external deps)
    String keyHex = field(json, "key_hex"), tenant = field(json, "tenant"),
        plaintext = field(json, "plaintext"), ciphertext = field(json, "ciphertext"),
        savedHash = field(json, "saved_hash"), password = field(json, "password");
    byte[] key = hex(keyHex);

    String decrypted = decrypt(ciphertext, key, tenant);
    System.out.println("TS->Java AES-GCM decrypt:   " + (decrypted.equals(plaintext) ? "PASS" : "FAIL: " + decrypted));

    String javaCiphertext = encrypt(plaintext, key, tenant);
    System.out.println("Java->TS direction vector:  " + javaCiphertext);

    // scrypt via Bouncy Castle, mirroring hashPassword: scrypt(pw, saltStringUtf8, 64) with Node defaults N=16384,r=8,p=1
    String[] parts = savedHash.split(":");
    byte[] salt = parts[0].getBytes(StandardCharsets.UTF_8); // hex STRING bytes, exactly as Node uses it
    byte[] derived = org.bouncycastle.crypto.generators.SCrypt.generate(
        password.getBytes(StandardCharsets.UTF_8), salt, 16384, 8, 1, 64);
    System.out.println("scrypt(SHA256 hex compare): " + (org.bouncycastle.util.encoders.Hex.toHexString(derived).equals(parts[1]) ? "PASS" : "FAIL"));
  }

  static String field(String json, String name) {
    int i = json.indexOf("\"" + name + "\": \"");
    if (i < 0) throw new IllegalArgumentException("field " + name);
    int start = i + name.length() + 5, end = json.indexOf('"', start);
    return json.substring(start, end);
  }

  static byte[] hex(String hex) {
    byte[] out = new byte[hex.length() / 2];
    for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(hex.substring(2 * i, 2 * i + 2), 16);
    return out;
  }
}
