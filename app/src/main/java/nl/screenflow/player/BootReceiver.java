package nl.screenflow.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Relaunch the same installed player after boot or a successful app replacement.
 * This never resets application data, player credentials, pairing or cached media.
 */
public final class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "NarrowVisionRestart";

    static boolean shouldLaunch(String action) {
        return Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !shouldLaunch(intent.getAction())) return;
        Intent player = new Intent(context, FullscreenActivity.class);
        player.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try {
            context.startActivity(player);
        } catch (RuntimeException launchFailure) {
            // Android/OEM background-activity restrictions can prevent an automatic launch.
            // Do not wipe credentials or repeatedly relaunch; a physical/device-owner
            // fallback must be validated on the actual TEST hardware.
            Log.w(TAG, "System prevented automatic player relaunch", launchFailure);
        }
    }
}
