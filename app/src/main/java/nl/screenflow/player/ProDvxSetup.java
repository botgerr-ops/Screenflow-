package nl.screenflow.player;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.widget.EditText;
import android.widget.Toast;

/** Operator-only local configuration. Never enter this credential in a chat or cloud portal. */
final class ProDvxSetup {
    private ProDvxSetup() { }

    static void show(Activity activity) {
        if (!ProDvxApi.isProDvxHardware()) {
            Toast.makeText(activity, "Geen ProDVX-hardware gedetecteerd.", Toast.LENGTH_LONG).show();
            return;
        }
        ProDvxTokenStore store = new ProDvxTokenStore(activity);
        EditText entry = new EditText(activity);
        entry.setSingleLine(true);
        entry.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        entry.setHint("ProDVX API bearer-token");
        int space = Math.round(20 * activity.getResources().getDisplayMetrics().density);
        entry.setPadding(space, space, space, space);
        String info = store.isConfigured()
                ? "ProDVX API is al ingesteld. Nieuwe token invoeren om te vervangen."
                : "Voer lokaal de unieke ProDVX API-token in. Eerst wordt alleen getDeviceInfo gecontroleerd.";
        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle("ProDVX OTA · TEST")
                .setMessage(info)
                .setView(entry)
                .setNegativeButton("Annuleren", (dialog, which) -> { })
                .setPositiveButton("Token controleren", (dialog, which) -> {
                    final String candidate = entry.getText().toString().trim();
                    entry.setText("");
                    new Thread(() -> {
                        boolean stored = false;
                        try {
                            if (ProDvxApi.probe(candidate)) {
                                store.save(candidate);
                                stored = true;
                            }
                        } catch (Exception ignored) { /* Never display or log bearer-token or OEM response. */ }
                        final boolean success = stored;
                        new Handler(Looper.getMainLooper()).post(() ->
                                Toast.makeText(activity, success
                                        ? "ProDVX API gecontroleerd; toekomstige TEST-updates gebruiken installatie + openen."
                                        : "ProDVX API niet bereikbaar, token ongeldig of opslaan mislukt; bestaande configuratie is behouden.",
                                        Toast.LENGTH_LONG).show());
                    }, "nv-prodvx-probe").start();
                });
        if (store.isConfigured()) builder.setNeutralButton("Token wissen", (dialog, which) -> {
            try {
                store.clear();
                Toast.makeText(activity, "ProDVX API uitgeschakeld.", Toast.LENGTH_LONG).show();
            } catch (Exception ignored) {
                Toast.makeText(activity, "Token wissen mislukt.", Toast.LENGTH_LONG).show();
            }
        });
        builder.show();
    }
}
