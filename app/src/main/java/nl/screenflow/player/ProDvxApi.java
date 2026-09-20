package nl.screenflow.player;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.UUID;

/** TEST-only OEM transport. All requests stay on loopback; no remote device API is exposed. */
final class ProDvxApi {
    private static final String BASE = "http://127.0.0.1:3535/v1/";
    private static final int MAX_RESPONSE = 16 * 1024;
    private ProDvxApi() { }

    static boolean isProDvxHardware() {
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String model = Build.MODEL == null ? "" : Build.MODEL;
        return manufacturer.toLowerCase(java.util.Locale.ROOT).contains("prodvx")
                || model.toLowerCase(java.util.Locale.ROOT).startsWith("abpc-")
                || model.toLowerCase(java.util.Locale.ROOT).startsWith("appc-");
    }

    /** Read-only check; the response may include sensitive OEM device data and is never logged. */
    static boolean probe(String token) throws Exception {
        JSONObject info = call("getDeviceInfo", token);
        String manufacturer = info.optString("deviceManufacturer", "");
        String model = info.optString("deviceModel", "");
        return "OK".equalsIgnoreCase(info.optString("status"))
                && (manufacturer.toLowerCase(java.util.Locale.ROOT).contains("prodvx")
                    || model.toLowerCase(java.util.Locale.ROOT).startsWith("abpc-")
                    || model.toLowerCase(java.util.Locale.ROOT).startsWith("appc-"));
    }

    static JSONObject call(String endpoint, String token) throws Exception {
        if (token == null || token.length() < 20 || token.length() > 4096
                || token.indexOf('\r') >= 0 || token.indexOf('\n') >= 0)
            throw new SecurityException("ProDVX API not provisioned");
        if (!endpoint.matches("(?:getDeviceInfo|getInstallInfo\\?installToken=[A-Za-z0-9_-]{1,256}|installFile\\?file=[A-Za-z0-9%_.\\/-]+&runAfterInstall=true)"))
            throw new SecurityException("Unsupported ProDVX endpoint");
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + endpoint).openConnection();
        connection.setRequestMethod("GET");
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(2500);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("Accept", "application/json");
        try {
            if (connection.getResponseCode() != 200) throw new SecurityException("ProDVX API unavailable or unauthorized");
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[2048]; int count;
                while ((count = in.read(buffer)) != -1) {
                    if (out.size() + count > MAX_RESPONSE) throw new SecurityException("Oversized ProDVX reply");
                    out.write(buffer, 0, count);
                }
                JSONObject response = new JSONObject(out.toString("UTF-8"));
                if (!"OK".equalsIgnoreCase(response.optString("status")))
                    throw new SecurityException("ProDVX operation failed");
                return response;
            }
        } finally { connection.disconnect(); }
    }

    /** Stages a previously SHA256- and signer-verified APK in Download via scoped MediaStore. */
    static Uri stageVerifiedApk(Context context, File privateApk, String expectedHash,
                                long expectedSize, int version) throws Exception {
        if (Build.VERSION.SDK_INT < 29 || !isProDvxHardware())
            throw new SecurityException("ProDVX scoped staging unsupported on this device");
        ContentResolver resolver = context.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME,
                "narrowvision-test-" + version + "-" + UUID.randomUUID() + ".apk");
        values.put(MediaStore.MediaColumns.MIME_TYPE, "application/vnd.android.package-archive");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/NarrowVisionUpdates/");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("Cannot stage verified APK");
        boolean ready = false;
        try {
            long copied = 0;
            try (InputStream in = new FileInputStream(privateApk);
                 OutputStream out = resolver.openOutputStream(uri, "w")) {
                if (out == null) throw new IllegalStateException("Staging stream unavailable");
                byte[] buffer = new byte[65536]; int count;
                while ((count = in.read(buffer)) != -1) {
                    copied += count;
                    if (copied > expectedSize) throw new SecurityException("Staged APK exceeds release size");
                    out.write(buffer, 0, count);
                }
            }
            if (copied != expectedSize) throw new SecurityException("Staged APK size mismatch");
            try (InputStream in = resolver.openInputStream(uri)) {
                if (in == null || !OtaUpdatePolicy.digestMatches(OtaUpdatePolicy.sha256(in), expectedHash))
                    throw new SecurityException("Staged APK digest mismatch");
            }
            ContentValues publish = new ContentValues(); publish.put(MediaStore.MediaColumns.IS_PENDING, 0);
            if (resolver.update(uri, publish, null, null) != 1)
                throw new IllegalStateException("Cannot publish staged APK");
            ready = true;
            return uri;
        } finally { if (!ready) resolver.delete(uri, null, null); }
    }

    static String stagedPath(Context context, Uri uri) throws Exception {
        String path = null;
        try (Cursor cursor = context.getContentResolver().query(uri,
                new String[]{MediaStore.MediaColumns.DATA}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) path = cursor.getString(0);
        }
        if (path == null) throw new SecurityException("No OEM-readable APK path");
        File root = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "NarrowVisionUpdates").getCanonicalFile();
        File candidate = new File(path).getCanonicalFile();
        if (!candidate.getParentFile().equals(root)
                || !candidate.getName().matches("narrowvision-test-[0-9]+-[a-f0-9-]{36}\\.apk"))
            throw new SecurityException("APK path outside dedicated staging directory");
        return candidate.getAbsolutePath();
    }

    /** No reboot. OEM installer runs the app after successful in-place installation. */
    static void installAndRun(Context context, File privateApk, String hash, long size,
                              int version, String token) throws Exception {
        if (!probe(token)) throw new SecurityException("ProDVX API model mismatch");
        Uri staged = stageVerifiedApk(context, privateApk, hash, size, version);
        boolean accepted = false;
        try {
            String path = stagedPath(context, staged);
            // Never send the bearer token in a URL or persist it alongside the APK.
            JSONObject result = call("installFile?file=" + Uri.encode(path) + "&runAfterInstall=true", token);
            String installToken = result.optString("installToken", "");
            if (installToken.isEmpty() || !installToken.matches("[A-Za-z0-9_-]{1,256}"))
                throw new SecurityException("ProDVX did not acknowledge installation");
            accepted = true;
            // The old process may be killed immediately; completion is confirmed by new app version
            // on resumePending(), not by the HTTP 200 / installation-started response.
        } finally {
            if (!accepted) context.getContentResolver().delete(staged, null, null);
        }
    }
}
