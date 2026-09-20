package nl.screenflow.player;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Separate OTA poller: does not change the existing media, planning or heartbeat code. */
final class OtaPolling {
    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final OtaUpdater updater;
    private volatile boolean stopped;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (stopped) return;
            worker.execute(() -> { if (!stopped) poll(); });
            handler.postDelayed(this, 30000L);
        }
    };

    OtaPolling(Activity activity) { this.activity = activity; updater = new OtaUpdater(activity); }
    void start() { updater.resumePending(); handler.postDelayed(tick, 15000L); }
    void stop() { stopped = true; handler.removeCallbacks(tick); worker.shutdownNow(); updater.shutdown(); }

    private void poll() {
        if (activity.getSharedPreferences(OtaUpdater.PREFS, Context.MODE_PRIVATE).contains(OtaUpdater.COMMAND))
            return; // A prior APK is already staged or awaits Android's install confirmation.
        PlayerIdentityStore identity = new PlayerIdentityStore(activity);
        if (!identity.hasCredentials()) return;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(BuildConfig.PLAYER_API_BASE_URL + "/player-update-poll").openConnection();
            connection.setRequestMethod("POST"); connection.setConnectTimeout(10000); connection.setReadTimeout(15000);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("X-Player-Id", identity.playerId());
            connection.setRequestProperty("X-Player-Secret", identity.secret());
            connection.setDoOutput(true);
            try (OutputStream out = connection.getOutputStream()) { out.write("{}".getBytes(StandardCharsets.UTF_8)); }
            if (connection.getResponseCode() != 200) return;
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int n;
                while ((n = in.read(buffer)) > 0) { if (out.size() + n > 65536) return; out.write(buffer, 0, n); }
                updater.offer(new JSONObject(out.toString("UTF-8")).optJSONArray("commands"));
            }
        } catch (Exception ignored) { /* The normal heartbeat and offline playback remain untouched. */ }
        finally { if (connection != null) connection.disconnect(); }
    }
}
