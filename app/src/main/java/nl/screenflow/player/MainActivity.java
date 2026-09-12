package nl.screenflow.player;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String BASE_URL = "https://screenflow.botger-r.chatgpt.site";
    private static final long POLL_INTERVAL_MS = 5000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private String deviceId;
    private TextView status;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersiveMode();
        deviceId = getPreferences(MODE_PRIVATE).getString("device_id", null);
        if (deviceId == null) {
            String androidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
            deviceId = (androidId == null ? UUID.randomUUID().toString() : androidId) + "-sf";
            getPreferences(MODE_PRIVATE).edit().putString("device_id", deviceId).apply();
        }
        String playerToken = getPreferences(MODE_PRIVATE).getString("player_token", null);
        if (playerToken == null) showPairingScreen(); else openPlayer(playerToken);
    }

    private void showPairingScreen() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(48, 48, 48, 48);
        layout.setBackgroundColor(Color.rgb(16, 17, 20));

        TextView logo = label("SCREENFLOW", 22, Color.rgb(242, 255, 98));
        TextView title = label("Koppel deze player", 34, Color.WHITE);
        title.setPadding(0, 36, 0, 12);
        status = label("Verbinding maken…", 18, Color.rgb(155, 157, 163));
        ProgressBar spinner = new ProgressBar(this);
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(56, 56);
        spinnerParams.topMargin = 36;
        layout.addView(logo); layout.addView(title); layout.addView(status); layout.addView(spinner, spinnerParams);
        setContentView(layout);
        registerDevice();
    }

    private TextView label(String text, int size, int color) {
        TextView view = new TextView(this);
        view.setText(text); view.setTextSize(size); view.setTextColor(color); view.setGravity(Gravity.CENTER);
        return view;
    }

    private void registerDevice() {
        network.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("deviceId", deviceId); body.put("name", "Galaxy Tab A8"); body.put("platform", "android-14");
                JSONObject response = request("POST", BASE_URL + "/api/device/register", body.toString());
                String code = response.getString("pairingCode");
                handler.post(() -> status.setText("Voer deze code in het dashboard in\n\n" + spaced(code)));
                handler.postDelayed(this::pollPairing, POLL_INTERVAL_MS);
            } catch (Exception error) {
                handler.post(() -> { status.setText("Geen verbinding. Nieuwe poging…"); handler.postDelayed(this::registerDevice, POLL_INTERVAL_MS); });
            }
        });
    }

    private void pollPairing() {
        network.execute(() -> {
            try {
                String encoded = URLEncoder.encode(deviceId, StandardCharsets.UTF_8.name());
                JSONObject response = request("GET", BASE_URL + "/api/device/register?deviceId=" + encoded, null);
                if (response.optBoolean("paired") && !response.isNull("playerToken")) {
                    String playerToken = response.getString("playerToken");
                    String accessToken = response.optString("accessToken", "");
                    getPreferences(MODE_PRIVATE).edit().putString("player_token", playerToken).putString("access_token", accessToken).apply();
                    handler.post(() -> openPlayer(playerToken));
                } else handler.postDelayed(this::pollPairing, POLL_INTERVAL_MS);
            } catch (Exception error) { handler.postDelayed(this::pollPairing, POLL_INTERVAL_MS); }
        });
    }

    private void openPlayer(String playerToken) {
        WebView webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return false; }
        });
        setContentView(webView);
        webView.loadUrl(BASE_URL + "/player/" + playerToken);
    }

    private JSONObject request(String method, String address, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setRequestMethod(method); connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
        connection.setRequestProperty("Accept", "application/json");
        if (body != null) {
            connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = connection.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int statusCode = connection.getResponseCode();
        InputStream stream = statusCode >= 200 && statusCode < 300 ? connection.getInputStream() : connection.getErrorStream();
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
        StringBuilder text = new StringBuilder(); String line;
        while ((line = reader.readLine()) != null) text.append(line);
        if (statusCode < 200 || statusCode >= 300) throw new IllegalStateException("HTTP " + statusCode);
        return new JSONObject(text.toString());
    }

    private String spaced(String value) { return value.replace("", " ").trim(); }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) enterImmersiveMode(); }
    @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); network.shutdownNow(); super.onDestroy(); }
}
