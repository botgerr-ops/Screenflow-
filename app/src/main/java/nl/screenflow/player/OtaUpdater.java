package nl.screenflow.player;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** TEST only. The existing signage continues while an authenticated update is downloaded.
 * Android's installer makes the final decision and may require user confirmation.
 */
public final class OtaUpdater {
    static final String PREFS = "narrowvision_ota_state";
    static final String COMMAND = "command_id", TARGET = "target_version_code";
    private static final long MAX_APK = 150L * 1024 * 1024;
    private final Activity activity;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    OtaUpdater(Activity activity) { this.activity = activity; }

    void offer(JSONArray commands) {
        if (commands == null) return;
        for (int i = 0; i < commands.length(); i++) {
            JSONObject command = commands.optJSONObject(i);
            if (command == null || !"update".equals(command.optString("type"))) continue;
            if (!running.compareAndSet(false, true)) return;
            worker.execute(() -> { try { process(command); } finally { running.set(false); } });
            return; // Never install two APKs concurrently.
        }
    }

    void resumePending() {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = prefs.getString(COMMAND, null);
        int target = prefs.getInt(TARGET, 0);
        if (id == null || target <= 0) return;
        if (BuildConfig.VERSION_CODE >= target) {
            worker.execute(() -> {
                if (OtaInstallReceiver.report(activity, id, "completed", "")) prefs.edit().clear().apply();
            });
        }
    }

    private void process(JSONObject command) {
        String id = command.optString("id", "");
        JSONObject payload = command.optJSONObject("payload");
        if (!uuid(id) || payload == null) return;
        int target = payload.optInt("target_version_code", 0);
        String pkg = payload.optString("package_name", "");
        String url = payload.optString("download_url", "");
        String hash = payload.optString("sha256", "");
        long size = payload.optLong("size_bytes", 0);
        if (!OtaUpdatePolicy.canInstall(BuildConfig.VERSION_CODE, target, pkg, url, hash)
                || size <= 0 || size > MAX_APK) {
            OtaInstallReceiver.report(activity, id, "failed", "invalid_release_metadata");
            return;
        }
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            OtaInstallReceiver.report(activity, id, "failed", "install_permission_required");
            activity.runOnUiThread(() -> {
                Toast.makeText(activity, "Sta updates voor NarrowVision toe op deze player.", Toast.LENGTH_LONG).show();
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName()));
                try { activity.startActivity(settings); } catch (Exception ignored) { }
            });
            return;
        }
        File apk = new File(activity.getCacheDir(), "nv-ota-verified.apk");
        try {
            download(url, apk, size);
            try (InputStream in = new FileInputStream(apk)) {
                if (!OtaUpdatePolicy.digestMatches(OtaUpdatePolicy.sha256(in), hash))
                    throw new SecurityException("apk_digest_mismatch");
            }
            verifyApk(apk, target);
            SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (!prefs.edit().putString(COMMAND, id).putInt(TARGET, target).commit())
                throw new IllegalStateException("pending_install_not_persisted");
            OtaInstallReceiver.report(activity, id, "acknowledged", "");
            install(apk, id, size);
        } catch (Exception failure) {
            prefs().edit().clear().apply();
            OtaInstallReceiver.report(activity, id, "failed", "download_or_verification_failed");
        } finally { if (apk.exists()) apk.delete(); }
    }

    private SharedPreferences prefs() { return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static boolean uuid(String value) {
        try { return UUID.fromString(value).toString().equalsIgnoreCase(value); }
        catch (Exception ignored) { return false; }
    }

    private static void download(String url, File output, long expectedSize) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
        try {
            if (connection.getResponseCode() != 200) throw new SecurityException("unexpected_download_response");
            long headerSize = connection.getContentLengthLong();
            if (headerSize > 0 && headerSize != expectedSize) throw new SecurityException("size_header_mismatch");
            long received = 0;
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(output, false)) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = in.read(buffer)) != -1) {
                    received += count;
                    if (received > MAX_APK || received > expectedSize) throw new SecurityException("apk_too_large");
                    out.write(buffer, 0, count);
                }
            }
            if (received != expectedSize) throw new SecurityException("apk_size_mismatch");
        } finally { connection.disconnect(); }
    }

    @SuppressWarnings("deprecation")
    private void verifyApk(File file, int expectedCode) throws Exception {
        PackageManager pm = activity.getPackageManager();
        int flag = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo candidate = pm.getPackageArchiveInfo(file.getAbsolutePath(), flag);
        PackageInfo installed = pm.getPackageInfo(activity.getPackageName(), flag);
        if (candidate == null || !activity.getPackageName().equals(candidate.packageName))
            throw new SecurityException("wrong_package");
        long code = Build.VERSION.SDK_INT >= 28 ? candidate.getLongVersionCode() : candidate.versionCode;
        if (code != expectedCode || code <= BuildConfig.VERSION_CODE) throw new SecurityException("wrong_version");
        Signature[] newSignatures = Build.VERSION.SDK_INT >= 28
                ? candidate.signingInfo.getApkContentsSigners() : candidate.signatures;
        Signature[] oldSignatures = Build.VERSION.SDK_INT >= 28
                ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
        if (newSignatures == null || oldSignatures == null || newSignatures.length != oldSignatures.length
                || newSignatures.length == 0) throw new SecurityException("missing_signer");
        for (int i = 0; i < newSignatures.length; i++) {
            boolean match = false;
            for (Signature old : oldSignatures) {
                if (MessageDigest.isEqual(newSignatures[i].toByteArray(), old.toByteArray())) { match = true; break; }
            }
            if (!match) throw new SecurityException("wrong_signer");
        }
    }

    private void install(File apk, String id, long size) throws Exception {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        params.setSize(size);
        if (Build.VERSION.SDK_INT >= 31)
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        int sessionId = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(sessionId)) {
            try (InputStream in = new FileInputStream(apk);
                 OutputStream out = session.openWrite("base.apk", 0, size)) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                session.fsync(out);
            }
            Intent callback = new Intent(activity, OtaInstallReceiver.class);
            callback.setAction("nl.screenflow.player.OTA_RESULT");
            callback.putExtra(COMMAND, id);
            PendingIntent pending = PendingIntent.getBroadcast(activity, sessionId, callback,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            session.commit(pending.getIntentSender());
        } catch (Exception exception) {
            installer.abandonSession(sessionId);
            throw exception;
        }
    }

    void shutdown() { worker.shutdown(); }
}
