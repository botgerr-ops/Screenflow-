package nl.screenflow.player;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.view.animation.AccelerateDecelerateInterpolator;

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
    private static final long SPLASH_DURATION_MS = 20000;
    private static final long HEARTBEAT_INTERVAL_MS = 30000;
    private static final long RECONNECT_INTERVAL_MS = 10000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private String deviceId;
    private TextView status;
    private TextView connectionBadge;
    private WebView playerView;
    private String playerUrl;

    private final Runnable reloadPlayer = new Runnable() {
        @Override public void run() {
            if (playerView != null && playerUrl != null) playerView.loadUrl(playerUrl);
        }
    };

    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            sendHeartbeat();
            handler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
        }
    };

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
        showSplash();
        handler.postDelayed(() -> {
            String playerToken = getPreferences(MODE_PRIVATE).getString("player_token", null);
            if (playerToken == null) showPairingScreen(); else openPlayer(playerToken);
        }, SPLASH_DURATION_MS);
    }

    private void showSplash() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(Color.rgb(16, 17, 20));
        ImageView mark = brandedMark(154);
        LinearLayout.LayoutParams markParams = new LinearLayout.LayoutParams(dp(154), dp(154));
        TextView name = label("SCREENFLOW", 24, Color.rgb(242, 255, 98));
        name.setLetterSpacing(.18f);
        name.setPadding(0, dp(22), 0, 0);
        TextView subtitle = label("DIGITAL SIGNAGE PLAYER", 12, Color.rgb(135, 137, 143));
        subtitle.setLetterSpacing(.28f);
        subtitle.setPadding(0, dp(8), 0, 0);
        TextView startupStatus = label("PLAYER VOORBEREIDEN", 11, Color.rgb(190, 192, 196));
        startupStatus.setLetterSpacing(.14f);
        startupStatus.setPadding(0, dp(48), 0, 0);
        LinearLayout dots = new LinearLayout(this);
        dots.setGravity(Gravity.CENTER);
        dots.setPadding(0, dp(14), 0, 0);
        for (int index = 0; index < 3; index++) {
            View dot = new View(this);
            GradientDrawable dotBackground = new GradientDrawable();
            dotBackground.setColor(index == 0 ? Color.rgb(242, 255, 98) : Color.rgb(62, 64, 68));
            dotBackground.setCornerRadius(dp(3));
            dot.setBackground(dotBackground);
            LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dp(index == 0 ? 28 : 8), dp(6));
            dotParams.setMargins(dp(4), 0, dp(4), 0);
            dots.addView(dot, dotParams);
        }
        layout.addView(mark, markParams);
        layout.addView(name);
        layout.addView(subtitle);
        layout.addView(startupStatus);
        layout.addView(dots);
        setContentView(layout);
        animateSplash(mark);
        handler.postDelayed(() -> startupStatus.setText("VERBINDING CONTROLEREN"), 5000);
        handler.postDelayed(() -> startupStatus.setText("CONTENT KLAARZETTEN"), 10000);
        handler.postDelayed(() -> startupStatus.setText("SCREENFLOW STARTEN"), 15000);
    }

    private ImageView brandedMark(int size) {
        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.ic_launcher_foreground);
        mark.setPadding(dp(12), dp(12), dp(12), dp(12));
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(242, 255, 98));
        background.setCornerRadius(dp(size / 5));
        mark.setBackground(background);
        return mark;
    }

    private void animateSplash(View mark) {
        mark.setAlpha(0f);
        mark.setScaleX(.72f);
        mark.setScaleY(.72f);
        ObjectAnimator fade = ObjectAnimator.ofFloat(mark, View.ALPHA, 0f, 1f);
        ObjectAnimator growX = ObjectAnimator.ofFloat(mark, View.SCALE_X, .72f, 1f);
        ObjectAnimator growY = ObjectAnimator.ofFloat(mark, View.SCALE_Y, .72f, 1f);
        AnimatorSet entrance = new AnimatorSet();
        entrance.playTogether(fade, growX, growY);
        entrance.setDuration(900);
        entrance.setInterpolator(new AccelerateDecelerateInterpolator());
        entrance.start();

        ObjectAnimator floatUp = ObjectAnimator.ofFloat(mark, View.TRANSLATION_Y, 0f, -dp(9), 0f);
        floatUp.setDuration(2800);
        floatUp.setRepeatCount(ValueAnimator.INFINITE);
        floatUp.setInterpolator(new AccelerateDecelerateInterpolator());
        floatUp.setStartDelay(900);
        floatUp.start();
        ObjectAnimator pulseX = ObjectAnimator.ofFloat(mark, View.SCALE_X, 1f, 1.035f, 1f);
        ObjectAnimator pulseY = ObjectAnimator.ofFloat(mark, View.SCALE_Y, 1f, 1.035f, 1f);
        pulseX.setDuration(2800);
        pulseY.setDuration(2800);
        pulseX.setRepeatCount(ValueAnimator.INFINITE);
        pulseY.setRepeatCount(ValueAnimator.INFINITE);
        pulseX.setStartDelay(900);
        pulseY.setStartDelay(900);
        pulseX.start();
        pulseY.start();
    }

    private void showPairingScreen() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(48, 48, 48, 48);
        layout.setBackgroundColor(Color.rgb(16, 17, 20));

        ImageView logo = brandedMark(104);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(104), dp(104));
        TextView title = label("Koppel deze player", 34, Color.WHITE);
        title.setPadding(0, dp(28), 0, dp(12));
        status = label("Verbinding maken…", 18, Color.rgb(155, 157, 163));
        status.setPadding(dp(28), dp(18), dp(28), dp(18));
        GradientDrawable statusBackground = new GradientDrawable();
        statusBackground.setColor(Color.rgb(242, 255, 98));
        statusBackground.setCornerRadius(dp(18));
        status.setBackground(statusBackground);
        status.setTextColor(Color.rgb(16, 17, 20));
        ProgressBar spinner = new ProgressBar(this);
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(56, 56);
        spinnerParams.topMargin = 36;
        layout.addView(logo, logoParams); layout.addView(title); layout.addView(status); layout.addView(spinner, spinnerParams);
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
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.BLACK);
        playerView = new WebView(this);
        playerView.setBackgroundColor(Color.BLACK);
        playerView.getSettings().setJavaScriptEnabled(true);
        playerView.getSettings().setDomStorageEnabled(true);
        playerView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        playerView.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK);
        playerView.setWebChromeClient(new WebChromeClient());
        playerView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return false; }
            @Override public void onPageFinished(WebView view, String url) {
                setConnectionState(true);
                handler.removeCallbacks(reloadPlayer);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    setConnectionState(false);
                    handler.removeCallbacks(reloadPlayer);
                    handler.postDelayed(reloadPlayer, RECONNECT_INTERVAL_MS);
                }
            }
        });
        frame.addView(playerView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        connectionBadge = label("OFFLINE · OPNIEUW VERBINDEN…", 11, Color.WHITE);
        connectionBadge.setLetterSpacing(.08f);
        connectionBadge.setPadding(dp(14), dp(8), dp(14), dp(8));
        GradientDrawable badgeBackground = new GradientDrawable();
        badgeBackground.setColor(Color.argb(225, 16, 17, 20));
        badgeBackground.setCornerRadius(dp(18));
        connectionBadge.setBackground(badgeBackground);
        connectionBadge.setVisibility(View.GONE);
        FrameLayout.LayoutParams badgeParams = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        badgeParams.setMargins(dp(16), dp(16), dp(16), dp(16));
        frame.addView(connectionBadge, badgeParams);
        setContentView(frame);
        playerUrl = BASE_URL + "/player/" + playerToken;
        playerView.loadUrl(playerUrl);
        handler.removeCallbacks(heartbeat);
        handler.post(heartbeat);
    }

    private void sendHeartbeat() {
        String token = getPreferences(MODE_PRIVATE).getString("access_token", null);
        if (token == null || token.isEmpty()) return;
        network.execute(() -> {
            try {
                request("POST", BASE_URL + "/api/device/heartbeat", "{}", token);
                handler.post(() -> setConnectionState(true));
            } catch (Exception error) {
                handler.post(() -> setConnectionState(false));
            }
        });
    }

    private void setConnectionState(boolean online) {
        if (connectionBadge != null) connectionBadge.setVisibility(online ? View.GONE : View.VISIBLE);
    }

    private JSONObject request(String method, String address, String body) throws Exception {
        return request(method, address, body, null);
    }

    private JSONObject request(String method, String address, String body, String bearerToken) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setRequestMethod(method); connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
        connection.setRequestProperty("Accept", "application/json");
        if (bearerToken != null) connection.setRequestProperty("Authorization", "Bearer " + bearerToken);
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

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) enterImmersiveMode(); }
    @Override protected void onResume() { super.onResume(); enterImmersiveMode(); }
    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (playerView != null) playerView.destroy();
        network.shutdownNow();
        super.onDestroy();
    }
}
