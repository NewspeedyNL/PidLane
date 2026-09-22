package nl.pidlane.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.WebViewListener;

/* Sterft de renderer, dan sterft de hele app (#229).

   De WebView-renderer draait in een eigen proces. Gaat dat dood, dan vraagt
   Android via onRenderProcessGone() wat er moet gebeuren — en bij "false"
   schiet het systeem het app-proces af, met de meetdienst, de wake lock en de
   adapterverbinding erin. Capacitor delegeert die vraag naar de geregistreerde
   WebViewListeners, en tot nu toe was dat een lege lijst.

   Deze luisteraar doet drie dingen, in deze volgorde:
   1. vastleggen wat er gebeurde (moment en didCrash), vóór er hersteld wordt:
      false = het systeem pakte geheugen terug, true = een interne fout. Na de
      herstart leest de app dat op via PLRenderPlugin en zet het in het logboek.
   2. true teruggeven, zodat het proces blijft leven.
   3. de dode WebView uit de hiërarchie halen en de activiteit opnieuw
      opbouwen. Hergebruiken mag niet: de gegeven WebView is onbruikbaar.

   Een rendercrash is op te wekken door chrome://crash in de WebView te laden. */
public final class PLRender {

    private static final String TAG = "PLRender";
    private static final String PREFS = "pl_render";
    private static final String K_MOMENT = "moment";
    private static final String K_CRASH = "crash";

    private PLRender() {}

    /* Na super.onCreate(): pas dan bestaat de bridge. */
    public static void koppel(final Activity act, final Bridge bridge) {
        if (bridge == null) {
            Log.w(TAG, "geen bridge — een rendercrash wordt niet afgevangen");
            return;
        }
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                boolean crash = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        && detail != null && detail.didCrash();
                Log.e(TAG, "renderer weg: " + (crash ? "interne fout" : "geheugen teruggepakt door het systeem")
                        + " — proces blijft leven, activiteit wordt opnieuw opgebouwd");
                noteer(act, crash);
                try {
                    ViewGroup ouder = (ViewGroup) view.getParent();
                    if (ouder != null) ouder.removeView(view);
                    view.destroy();
                } catch (Exception e) {
                    Log.e(TAG, "dode WebView opruimen mislukt", e);
                }
                try {
                    act.recreate();
                } catch (Exception e) {
                    Log.e(TAG, "activiteit opnieuw opbouwen mislukt", e);
                }
                return true;
            }
        });
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void noteer(Context c, boolean crash) {
        // commit() en niet apply(): het moet op schijf staan vóór de herstart.
        prefs(c).edit().putLong(K_MOMENT, System.currentTimeMillis()).putBoolean(K_CRASH, crash).commit();
    }

    /* De laatste rendercrash, en meteen vergeten: één melding per crash.
       moment 0 = er was er geen. */
    static long[] neemLaatste(Context c) {
        SharedPreferences p = prefs(c);
        long moment = p.getLong(K_MOMENT, 0L);
        boolean crash = p.getBoolean(K_CRASH, false);
        if (moment != 0L) p.edit().remove(K_MOMENT).remove(K_CRASH).apply();
        return new long[] { moment, crash ? 1L : 0L };
    }
}
