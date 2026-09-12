package nl.screenflow.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Intent player = new Intent(context, MainActivity.class);
            player.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(player);
        }
    }
}
