// ══════════════════════════════════════════════════════════════════
//  PLMeetdienstPlugin.java — de brug tussen de app en PLMeetdienst (#18)
// ──────────────────────────────────────────────────────────────────
//  Vijf methoden, en met opzet niet meer. Alles wat een oordeel is — hoe lang
//  liep de lus door, hoe lang lag hij stil, was het bevriezing of afknijping —
//  gebeurt in pidlane-meetdienst.js. Deze klasse levert ruwe getallen en de
//  eerlijke reden als er iets niet lukt.
//
//    status()    draait de dienst, en kán hij hier überhaupt draaien
//    start()     start hem; bij weigering staat de reden in het antwoord
//    stop()      stopt hem
//    nulstel()   zet de hartslagteller op nul (bij het wegschakelen)
//    rapport()   wat de hartslag sindsdien gedaan heeft
//
//  WAAROM EEN REDEN EN GEEN EXCEPTIE. Android 12+ weigert het starten van een
//  foreground service vanuit de achtergrond met een
//  ForegroundServiceStartNotAllowedException. Zou die als afwijzing naar
//  JavaScript gaan, dan komt hij in een catch terecht en is er alleen "het
//  lukte niet". De app moet kunnen MELDEN waarom de meting niet loopt, want
//  een meting die stil niet loopt is precies de vorm van #18 zelf.
// ══════════════════════════════════════════════════════════════════
package app.pidlane.obd;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "PLMeetdienst",
    permissions = {
        // POST_NOTIFICATIONS bestaat pas vanaf Android 13. De dienst draait
        // ook zonder: het systeem onderdrukt dan alleen de melding, niet de
        // service. Daarom is dit geen poort maar een verzoek.
        @Permission(alias = "melding", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class PLMeetdienstPlugin extends Plugin {

    private static final String TAG = "PLMeetdienstPlugin";

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("beschikbaar", true);
        r.put("draait", PLMeetdienst.draait());
        r.put("hartslagMs", PLMeetdienst.HARTSLAG_MS);
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        JSObject r = new JSObject();
        try {
            Intent i = new Intent(getContext(), PLMeetdienst.class);
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
            else getContext().startService(i);
            r.put("draait", true);
            r.put("reden", "gestart");
        } catch (Exception e) {
            // Geen stille catch. Dit is de plek waar de meting stil kan
            // uitvallen, en dan hoort de app dat te kunnen zeggen.
            Log.e(TAG, "meetdienst niet gestart (#18)", e);
            r.put("draait", PLMeetdienst.draait());
            r.put("reden", "geweigerd: " + e.getClass().getSimpleName() +
                    (e.getMessage() == null ? "" : " — " + e.getMessage()));
        }
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        JSObject r = new JSObject();
        try {
            getContext().stopService(new Intent(getContext(), PLMeetdienst.class));
            r.put("draait", false);
            r.put("reden", "gestopt");
        } catch (Exception e) {
            Log.e(TAG, "meetdienst niet gestopt (#18)", e);
            r.put("draait", PLMeetdienst.draait());
            r.put("reden", "stoppen mislukt: " + e.getClass().getSimpleName());
        }
        call.resolve(r);
    }

    @PluginMethod
    public void nulstel(PluginCall call) {
        PLMeetdienst.nulstel();
        JSObject r = new JSObject();
        r.put("draait", PLMeetdienst.draait());
        call.resolve(r);
    }

    @PluginMethod
    public void rapport(PluginCall call) {
        PLMeetdienst.Meting m = PLMeetdienst.meting();
        JSObject r = new JSObject();
        r.put("draait", m.draait);
        r.put("van", m.van);
        r.put("nu", m.nu);
        r.put("laatste", m.laatste);
        r.put("slagen", m.slagen);
        r.put("stilMs", m.stilMs);
        r.put("stilVan", m.stilVan);
        r.put("hartslagMs", m.hartslagMs);
        call.resolve(r);
    }

    @PluginMethod
    public void vraagMelding(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            // Vóór Android 13 bestaat de permissie niet en is de melding
            // vanzelf toegestaan. Dat als "granted" melden is eerlijker dan
            // een verzoek doen dat nergens landt.
            JSObject r = new JSObject();
            r.put("melding", "granted");
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("melding", call, "meldingKlaar");
    }

    @PermissionCallback
    private void meldingKlaar(PluginCall call) {
        JSObject r = new JSObject();
        r.put("melding", getPermissionState("melding").toString());
        call.resolve(r);
    }
}
