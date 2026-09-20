package nl.screenflow.player;

import android.os.Build;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** HTTP-only API client. It never logs headers, player secrets or signed media URLs. */
public final class PlayerApiClient {
    public static final class ApiException extends Exception { public final int status; ApiException(int status, String message) { super(message); this.status = status; } }
    private final PlayerIdentityStore store;
    public PlayerApiClient(PlayerIdentityStore store) { this.store = store; }
    public JSONObject bootstrap() throws Exception { return post("player-bootstrap", metadata(), false); }
    public JSONObject heartbeat(long revision, boolean syncSucceeded, String playlistId) throws Exception {
        return heartbeat(revision, syncSucceeded, playlistId, false);
    }
    /** Acknowledgement is sent only after the player has stopped and erased prior tenant files. */
    public JSONObject heartbeat(long revision, boolean syncSucceeded, String playlistId, boolean unpairAck) throws Exception {
        JSONObject body = metadata();
        body.put("config_revision", revision);
        body.put("sync_succeeded", syncSucceeded);
        if (playlistId == null) body.put("current_playlist_id", JSONObject.NULL); else body.put("current_playlist_id", playlistId);
        if (unpairAck) body.put("unpair_ack", true);
        JSONObject result = post("player-heartbeat", body, true);
        // Server has released the old license. Fetch its freshly generated pairing code
        // immediately rather than leaving the device on an empty pairing screen for 30 s.
        if (unpairAck && result.optBoolean("unpair_completed")) return heartbeat(0, false, null);
        return result;
    }
    public JSONObject config() throws Exception { return post("player-config", new JSONObject(), true); }
    private JSONObject metadata() throws Exception {
        JSONObject body = new JSONObject();
        body.put("device_uid", store.deviceUid()); body.put("platform", "android");
        body.put("manufacturer", safe(Build.MANUFACTURER)); body.put("model", safe(Build.MODEL));
        body.put("os_version", safe(Build.VERSION.RELEASE)); body.put("sdk_version", Build.VERSION.SDK_INT);
        body.put("firmware_version", safe(Build.DISPLAY)); body.put("app_version", BuildConfig.VERSION_NAME); return body;
    }
    private String safe(String value) { return value == null ? "unknown" : value.trim(); }
    private JSONObject post(String route, JSONObject body, boolean authenticate) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(BuildConfig.PLAYER_API_BASE_URL + "/" + route).openConnection();
        c.setRequestMethod("POST"); c.setConnectTimeout(10000); c.setReadTimeout(15000);
        c.setRequestProperty("Accept", "application/json"); c.setRequestProperty("Content-Type", "application/json");
        if (authenticate) { String id = store.playerId(), secret = store.secret(); if (id == null || secret == null) throw new ApiException(401, "Playeridentiteit ontbreekt"); c.setRequestProperty("X-Player-Id", id); c.setRequestProperty("X-Player-Secret", secret); }
        c.setDoOutput(true); try (OutputStream out = c.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode(); InputStream input = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
        StringBuilder text = new StringBuilder(); if (input != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) { String line; while ((line = reader.readLine()) != null) text.append(line); }
        JSONObject response = text.length() == 0 ? new JSONObject() : new JSONObject(text.toString());
        if (code < 200 || code >= 300) throw new ApiException(code, response.optString("message", response.optString("error", "Verbinding met playerservice mislukt")));
        return response;
    }
}
