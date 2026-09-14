package nl.screenflow.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores the device identity separately from the player secret. The secret is AES-GCM encrypted
 * with a non-exportable Android Keystore key; clearing app data intentionally creates a new UID. */
public final class PlayerIdentityStore {
    private static final String PREFS = "narrowvision_player_identity";
    private static final String KEY_ALIAS = "narrowvision.player.secret.v1";
    private final SharedPreferences prefs;

    public PlayerIdentityStore(Context context) { prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    public String deviceUid() {
        String value = prefs.getString("device_uid", null);
        if (value == null) { value = UUID.randomUUID().toString(); prefs.edit().putString("device_uid", value).apply(); }
        return value;
    }
    public String playerId() { return prefs.getString("player_id", null); }
    public String pairingCode() { return prefs.getString("pairing_code", null); }
    public String pairingExpiresAt() { return prefs.getString("pairing_expires_at", null); }
    public void savePairing(String code, String expiresAt) { prefs.edit().putString("pairing_code", code).putString("pairing_expires_at", expiresAt).apply(); }
    public void clearPairing() { prefs.edit().remove("pairing_code").remove("pairing_expires_at").apply(); }
    public boolean hasCredentials() { return playerId() != null && secret() != null; }
    public void saveCredentials(String playerId, String secret) throws Exception {
        prefs.edit().putString("player_id", playerId).putString("secret", encrypt(secret)).apply();
    }
    public String secret() {
        try { String value = prefs.getString("secret", null); return value == null ? null : decrypt(value); }
        catch (Exception ignored) { return null; }
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
    }
    private String encrypt(String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }
    private String decrypt(String stored) throws Exception {
        String[] parts = stored.split("\\.", 2); if (parts.length != 2) throw new IllegalStateException("Invalid encrypted identity");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
}
