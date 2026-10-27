// ══════════════════════════════════════════════════════════════════
//  PLWekkerDienst.java — het gekoppelde apparaat is er: open de app
// ──────────────────────────────────────────────────────────────────
//  Android bindt deze dienst als een apparaat dat via PLWekkerPlugin
//  gekoppeld is in de buurt komt (BLE) of verbindt (de handsfree van de
//  auto). Dan opent hij MainActivity; de app doet de rest zelf: inloggen met
//  het sessietoken, verbinden met de laatste adapter, en bij een eerste
//  opstart de check (pidlane-opstart.js).
//
//  Een app met een bijbehorend apparaat mag vanuit de achtergrond een
//  activiteit starten; dat is de uitzondering die CompanionDeviceManager
//  geeft. Weigert het systeem het toch (vergrendeld scherm, een fabrikant
//  die strenger is), dan staat er een melding om op te tikken. Die verloopt
//  na twee minuten: een melding over een rit die al bezig is, is ruis.
//
//  Hoogstens één keer per WEK_RUST_MS: een handsfree die tijdens het rijden
//  even wegvalt en terugkomt, is geen nieuwe start.
// ══════════════════════════════════════════════════════════════════
package nl.pidlane.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.companion.CompanionDeviceService;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

@androidx.annotation.RequiresApi(31)
public class PLWekkerDienst extends CompanionDeviceService {

    private static final String TAG = "PLWekkerDienst";
    private static final String KANAAL = "pl_wekker";
    private static final String LAATST = "laatst";
    static final long WEK_RUST_MS = 10 * 60 * 1000L;

    @Override
    @SuppressWarnings("deprecation")
    public void onDeviceAppeared(String adres) {
        Log.i(TAG, "apparaat verschenen");
        if (!PLWekkerPlugin.aan(this)) { Log.i(TAG, "wekker staat uit — niets gedaan"); return; }
        SharedPreferences p = getSharedPreferences(PLWekkerPlugin.PREFS, Context.MODE_PRIVATE);
        long nu = System.currentTimeMillis();
        if (nu - p.getLong(LAATST, 0) < WEK_RUST_MS) { Log.i(TAG, "net al gewekt — overgeslagen"); return; }
        p.edit().putLong(LAATST, nu).apply();

        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) { Log.w(TAG, "geen startactiviteit gevonden"); return; }
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        open.putExtra("pl_wekker", true);
        try {
            startActivity(open);
        } catch (Exception e) {
            Log.w(TAG, "app openen vanuit de achtergrond geweigerd — alleen de melding", e);
        }
        melding(open);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onDeviceDisappeared(String adres) {
        Log.i(TAG, "apparaat weg");
    }

    private void melding(Intent open) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) { Log.w(TAG, "geen NotificationManager — geen melding"); return; }
        NotificationChannel k = new NotificationChannel(KANAAL, "Auto gestart",
                NotificationManager.IMPORTANCE_DEFAULT);
        k.setDescription("Als je auto start, opent PidLane vanzelf. Lukt dat niet, dan staat hier een melding om op te tikken.");
        k.setShowBadge(false);
        nm.createNotificationChannel(k);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, KANAAL)
            .setContentTitle("Je auto is gestart")
            .setContentText("PidLane verbindt met je auto. Tik om te openen.")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setTimeoutAfter(120000)
            .build();
        try { nm.notify(0x504C, n); }
        catch (Exception e) { Log.w(TAG, "melding geweigerd (geen toestemming?)", e); }
    }
}
