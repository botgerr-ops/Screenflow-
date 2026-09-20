package nl.screenflow.player;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

/** Best-effort storage hygiene; never deletes media or other applications' downloads. */
final class ProDvxStagingCleanup {
    private ProDvxStagingCleanup() { }

    static boolean replacementConfirmed(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(OtaUpdater.PREFS, Context.MODE_PRIVATE);
        return prefs.getString(OtaUpdater.COMMAND, null) != null
                && prefs.getInt(OtaUpdater.TARGET, 0) > 0
                && BuildConfig.VERSION_CODE >= prefs.getInt(OtaUpdater.TARGET, 0);
    }

    static void cleanup(Context context) {
        if (Build.VERSION.SDK_INT < 29) return;
        ContentResolver resolver = context.getContentResolver();
        try (Cursor cursor = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.MediaColumns._ID,
                        MediaStore.MediaColumns.DISPLAY_NAME,
                        MediaStore.MediaColumns.RELATIVE_PATH,
                        MediaStore.MediaColumns.OWNER_PACKAGE_NAME},
                MediaStore.MediaColumns.RELATIVE_PATH + "=?",
                new String[]{"Download/NarrowVisionUpdates/"}, null)) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                String name = cursor.getString(1);
                String owner = cursor.getString(3);
                if (!context.getPackageName().equals(owner) || name == null
                        || !name.matches("narrowvision-test-[0-9]+-[a-f0-9-]{36}\\.apk")) continue;
                Uri uri = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cursor.getLong(0));
                try {
                    ProDvxApi.stagedPath(context, uri); // Enforce canonical dedicated directory.
                    resolver.delete(uri, null, null);
                } catch (Exception ignored) { /* Fail closed on missing ownership/path/permission. */ }
            }
        } catch (Exception ignored) { /* Cleanup must never affect normal playback or OTA state. */ }
    }
}
