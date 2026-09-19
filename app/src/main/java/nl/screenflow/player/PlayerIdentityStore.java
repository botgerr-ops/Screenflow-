package nl.screenflow.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Private player identity. A revoked player must purge cached customer media and snapshot
 * before it is ever permitted to bootstrap or pair with another customer. */
public final class PlayerIdentityStore {
    private static final String PREFS = "narrowvision_player_identity";
    private static final String KEY_ALIAS = "narrowvision.player.secret.v1";
    private static final String RESET_PENDING = "secure_reset_pending";
    private final Context context;
    private final SharedPreferences prefs;

    public PlayerIdentityStore(Context context) {
        this.context = context.getApplicationContext();
        prefs = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
    public synchronized String deviceUid() {
        requireResetComplete();
        String value = prefs.getString("device_uid", null);
        if (value == null) {
            value = UUID.randomUUID().toString();
            if (!prefs.edit().putString("device_uid", value).commit()) throw new IllegalStateException("Playeridentiteit kon niet worden opgeslagen");
        }
        return value;
    }
    public String playerId() { return prefs.getString("player_id", null); }
    public String pairingCode() { return prefs.getString("pairing_code", null); }
    public String pairingExpiresAt() { return prefs.getString("pairing_expires_at", null); }
    public void savePairing(String code, String expiresAt) { prefs.edit().putString("pairing_code", code).putString("pairing_expires_at", expiresAt).apply(); }
    public void clearPairing() { prefs.edit().remove("pairing_code").remove("pairing_expires_at").apply(); }
    public boolean hasCredentials() {
        if (prefs.getBoolean(RESET_PENDING, false)) return false;
        return playerId() != null && secret() != null;
    }

    /** On HTTP 401: revoke local authentication and securely isolate any previous tenant.
     * A failed deletion leaves RESET_PENDING set: bootstrap and saveCredentials refuse to run. */
    public synchronized void clearCredentials() {
        if (!prefs.edit().putBoolean(RESET_PENDING, true).commit())
            throw new IllegalStateException("Veilige reset kon niet worden geregistreerd");
        if (!prefs.edit().remove("player_id").remove("secret").remove("pairing_code").remove("pairing_expires_at").commit())
            throw new IllegalStateException("Playergegevens konden niet worden ingetrokken");
        requireResetComplete();
    }
    public synchronized void saveCredentials(String playerId, String secret) throws Exception {
        requireResetComplete();
        if (!prefs.edit().putString("player_id", playerId).putString("secret", encrypt(secret)).commit())
            throw new IllegalStateException("Playergegevens konden niet worden opgeslagen");
    }
    public String secret() {
        if (prefs.getBoolean(RESET_PENDING, false)) return null;
        try { String value = prefs.getString("secret", null); return value == null ? null : decrypt(value); }
        catch (Exception ignored) { return null; }
    }

    /** No symlinks or external paths: this deletes only the app-owned media-cache directory. */
    private void requireResetComplete() {
        if (!prefs.getBoolean(RESET_PENDING, false)) return;
        File directory = new File(context.getFilesDir(), "media-cache");
        if (directory.exists()) {
            if (!directory.isDirectory()) throw new IllegalStateException("Media-cache is geen map");
            File[] entries = directory.listFiles();
            if (entries == null) throw new IllegalStateException("Media-cache kon niet worden gelezen");
            for (File file : entries) {
                if (!file.isFile() || !file.delete()) throw new IllegalStateException("Oude media kon niet veilig worden gewist");
            }
        }
        if (!context.getSharedPreferences("narrowvision_player_media", Context.MODE_PRIVATE).edit().clear().commit())
            throw new IllegalStateException("Media-index kon niet worden gewist");
        if (!context.getSharedPreferences("narrowvision_player_state", Context.MODE_PRIVATE).edit().clear().commit())
            throw new IllegalStateException("Offline snapshot kon niet worden gewist");
        if (!prefs.edit().remove(RESET_PENDING).commit())
            throw new IllegalStateException("Veilige reset kon niet worden afgerond");
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
