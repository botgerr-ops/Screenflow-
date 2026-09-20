package nl.screenflow.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Optional per-device OEM credential; never ship it in an APK, OTA command or cloud config. */
final class ProDvxTokenStore {
    private static final String PREFS = "narrowvision_prodvx_local_v1";
    private static final String ENTRY = "encrypted_api_token";
    private static final String ALIAS = "narrowvision.prodvx.api.token.v1";
    private final SharedPreferences prefs;

    ProDvxTokenStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    boolean isConfigured() { return prefs.contains(ENTRY); }

    String get() throws Exception {
        String stored = prefs.getString(ENTRY, null);
        if (stored == null) return null;
        String[] parts = stored.split("\\.", 2);
        if (parts.length != 2) throw new SecurityException("ProDVX token could not be decrypted");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128,
                Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    void save(String token) throws Exception {
        if (token == null || token.length() < 20 || token.length() > 4096 || token.contains("\n")
                || token.contains("\r")) throw new IllegalArgumentException("Invalid API token");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        String stored = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "."
                + Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!prefs.edit().putString(ENTRY, stored).commit())
            throw new IllegalStateException("Could not persist ProDVX token");
    }

    void clear() {
        if (!prefs.edit().remove(ENTRY).commit())
            throw new IllegalStateException("Could not clear ProDVX token");
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
    }
}
