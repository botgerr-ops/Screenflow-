package nl.screenflow.player;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Downloads signed media URLs into private app storage. Files are only replaced when server metadata changes. */
public final class MediaCache {
    private final File directory;
    private final SharedPreferences metadata;

    public MediaCache(Context context) {
        directory = new File(context.getFilesDir(), "media-cache");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Media-cache kan niet worden gemaakt");
        metadata = context.getSharedPreferences("narrowvision_player_media", Context.MODE_PRIVATE);
    }

    public File ensure(JSONObject media) throws Exception {
        String id = media.getString("media_id");
        String updated = media.optString("updated_at", "");
        String mime = media.optString("mime_type", "");
        File target = new File(directory, id + extension(mime));
        String known = metadata.getString(id, null);
        if (target.isFile() && updated.equals(known)) return target;

        File temporary = new File(directory, id + ".download");
        HttpURLConnection connection = (HttpURLConnection) new URL(media.getString("signed_url")).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        connection.setRequestProperty("Accept", mime.isEmpty() ? "*/*" : mime);
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) throw new IllegalStateException("Media-download mislukt");
        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
            byte[] buffer = new byte[32 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        } finally { connection.disconnect(); }
        if (!temporary.renameTo(target)) {
            if (!target.delete() || !temporary.renameTo(target)) throw new IllegalStateException("Media-cache kon niet worden bijgewerkt");
        }
        metadata.edit().putString(id, updated).apply();
        return target;
    }

    private String extension(String mime) {
        if ("image/jpeg".equalsIgnoreCase(mime)) return ".jpg";
        if ("image/png".equalsIgnoreCase(mime)) return ".png";
        if ("video/mp4".equalsIgnoreCase(mime)) return ".mp4";
        if ("video/quicktime".equalsIgnoreCase(mime)) return ".mov";
        return ".bin";
    }
}
