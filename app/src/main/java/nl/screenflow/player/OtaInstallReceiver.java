package nl.screenflow.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.os.Build;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Private PackageInstaller callback. Never expose player credentials in the intent. */
public final class OtaInstallReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !"nl.screenflow.player.OTA_RESULT".equals(intent.getAction())) return;
        SharedPreferences prefs = context.getSharedPreferences(OtaUpdater.PREFS, Context.MODE_PRIVATE);
        String id = intent.getStringExtra(OtaUpdater.COMMAND);
        if (id == null || !id.equals(prefs.getString(OtaUpdater.COMMAND, null))) return;
        int code = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (code == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent approval = Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                    : (Intent) intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (approval != null) {
                approval.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { context.startActivity(approval); return; }
                catch (Exception ignored) { /* Physical operator must enable installer if Android blocks background launch. */ }
            }
            final PendingResult pending = goAsync();
            new Thread(() -> { try { report(context, id, "failed", "user_approval_required_on_device"); }
                finally { pending.finish(); } }, "nv-ota-consent").start();
            return;
        }
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                String status = code == PackageInstaller.STATUS_SUCCESS ? "completed" : "failed";
                boolean sent = report(context, id, status, code == PackageInstaller.STATUS_SUCCESS ? "" : "android_installer_failed");
                if (sent) prefs.edit().clear().apply();
            } finally { pending.finish(); }
        }, "nv-ota-result").start();
    }

    static boolean report(Context context, String id, String status, String reason) {
        try {
            if (!UUID.fromString(id).toString().equalsIgnoreCase(id)) return false;
            if (!"acknowledged".equals(status) && !"completed".equals(status) && !"failed".equals(status)) return false;
            PlayerIdentityStore identity = new PlayerIdentityStore(context);
            if (!identity.hasCredentials()) return false;
            HttpURLConnection c = (HttpURLConnection) new URL(BuildConfig.PLAYER_API_BASE_URL + "/player-update-status").openConnection();
            c.setRequestMethod("POST"); c.setConnectTimeout(10000); c.setReadTimeout(15000);
            c.setRequestProperty("X-Player-Id", identity.playerId());
            c.setRequestProperty("X-Player-Secret", identity.secret());
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            JSONObject body = new JSONObject().put("command_id", id).put("status", status)
                    .put("reason", reason == null ? "" : reason);
            try (OutputStream out = c.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int http = c.getResponseCode(); c.disconnect();
            return http >= 200 && http < 300;
        } catch (Exception ignored) { return false; }
    }
}
