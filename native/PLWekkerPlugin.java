// ══════════════════════════════════════════════════════════════════
//  PLWekkerPlugin.java — de auto wekt de app (27-10-2026)
// ──────────────────────────────────────────────────────────────────
//  De klant koppelt één keer een Bluetooth-apparaat als "bijbehorend
//  apparaat" (CompanionDeviceManager): de handsfree van de auto, of een
//  BLE-adapter. Daarna meldt Android aan PLWekkerDienst wanneer dat apparaat
//  verschijnt, en die opent de app. Een klassieke SPP-adapter verschijnt
//  nooit vanzelf — hij is pas "er" als de app al verbindt — vandaar dat de
//  klant zelf kiest, met de uitleg in pidlane-opstart.js.
//
//    status()     kan het op dit toestel, wat is er gekoppeld, staat hij aan
//    koppel()     Androids eigen keuzelijst; lost op met het gekozen adres
//    ontkoppel()  alles los, en de wekker uit
//    zet({aan})   de wekker aan of uit zonder de koppeling te verliezen
//
//  WAAROM GEEN ACTIVITY-RESULT. Vóór Android 13 komt de keuze alleen terug
//  via startIntentSenderForResult, en Capacitor heeft daar geen nette haak
//  voor. Daarom: vóór het openen de bestaande koppelingen onthouden en bij
//  terugkeer (handleOnResume) kijken wat erbij kwam. Vanaf 13 meldt
//  onAssociationCreated het rechtstreeks.
//
//  De oordelen (wanneer koppelen zinvol is, welke tekst erbij) staan in
//  pidlane-opstart.js. Hier alleen ruwe staat en de eerlijke reden.
// ══════════════════════════════════════════════════════════════════
package nl.pidlane.app;

import android.companion.AssociationRequest;
import android.companion.BluetoothDeviceFilter;
import android.companion.BluetoothLeDeviceFilter;
import android.companion.CompanionDeviceManager;
import android.content.Context;
import android.content.IntentSender;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "PLWekker")
public class PLWekkerPlugin extends Plugin {

    private static final String TAG = "PLWekkerPlugin";
    static final String PREFS = "pl_wekker";
    static final String AAN = "aan";

    private PluginCall wacht = null;
    private List<String> voor = null;

    private CompanionDeviceManager cdm() {
        Context c = getContext();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null;
        if (!c.getPackageManager().hasSystemFeature(PackageManager.FEATURE_COMPANION_DEVICE_SETUP)) return null;
        return (CompanionDeviceManager) c.getSystemService(Context.COMPANION_DEVICE_SERVICE);
    }

    // Aanwezigheid volgen kan pas vanaf Android 12 (API 31).
    private boolean ondersteund() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && cdm() != null;
    }

    @SuppressWarnings("deprecation")
    private List<String> adressen() {
        List<String> uit = new ArrayList<>();
        CompanionDeviceManager m = cdm();
        if (m == null) return uit;
        try {
            for (String a : m.getAssociations()) if (a != null) uit.add(a.toUpperCase());
        } catch (Exception e) {
            Log.w(TAG, "koppelingen niet te lezen", e);
        }
        return uit;
    }

    static boolean aan(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(AAN, false);
    }

    private void zetAan(boolean a) {
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putBoolean(AAN, a).apply();
    }

    private String volg(String adres) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "Android 12 of nieuwer nodig";
        try {
            cdm().startObservingDevicePresence(adres);
            return null;
        } catch (Exception e) {
            Log.w(TAG, "aanwezigheid niet te volgen: " + adres, e);
            return "aanwezigheid volgen geweigerd: " + e.getMessage();
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("beschikbaar", true);
        r.put("ondersteund", ondersteund());
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("aan", aan(getContext()));
        JSArray g = new JSArray();
        for (String a : adressen()) g.put(a);
        r.put("gekoppeld", g);
        call.resolve(r);
    }

    @PluginMethod
    public void koppel(PluginCall call) {
        if (!ondersteund()) {
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("reden", Build.VERSION.SDK_INT < Build.VERSION_CODES.S ? "Android 12 of nieuwer nodig" : "dit toestel kent geen bijbehorende apparaten");
            call.resolve(r);
            return;
        }
        if (wacht != null) { wacht.resolve(uitslag(false, null, "vervangen door een nieuwe koppelpoging")); }
        wacht = call;
        voor = adressen();
        // Geen filter op naam of adres: de klant kiest zelf, de auto of een
        // BLE-adapter. Twee filters zodat beide soorten in de lijst staan.
        AssociationRequest verzoek = new AssociationRequest.Builder()
            .addDeviceFilter(new BluetoothDeviceFilter.Builder().build())
            .addDeviceFilter(new BluetoothLeDeviceFilter.Builder().build())
            .setSingleDevice(false)
            .build();
        try {
            cdm().associate(verzoek, new CompanionDeviceManager.Callback() {
                @Override
                public void onDeviceFound(IntentSender kiezer) {
                    try {
                        getActivity().startIntentSenderForResult(kiezer, 0x504C, null, 0, 0, 0);
                    } catch (Exception e) {
                        Log.w(TAG, "keuzelijst opent niet", e);
                        klaar(false, null, "keuzelijst opent niet: " + e.getMessage());
                    }
                }

                @androidx.annotation.RequiresApi(33)
                @Override
                public void onAssociationCreated(android.companion.AssociationInfo info) {
                    // Android 13+: de keuze komt hier rechtstreeks binnen.
                    String a = null;
                    try { a = info.getDeviceMacAddress() != null ? info.getDeviceMacAddress().toString().toUpperCase() : null; }
                    catch (Exception e) { Log.w(TAG, "adres uit de koppeling niet te lezen", e); }
                    nieuw(a);
                }

                @Override
                public void onFailure(CharSequence fout) {
                    klaar(false, null, fout == null ? "geen apparaat gekozen" : fout.toString());
                }
            }, null);
        } catch (Exception e) {
            Log.w(TAG, "koppelen niet gestart", e);
            klaar(false, null, "koppelen niet gestart: " + e.getMessage());
        }
    }

    // Terug uit de keuzelijst (Android 12): wat kwam erbij?
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (wacht == null || voor == null) return;
        List<String> nu = adressen();
        for (String a : nu) if (!voor.contains(a)) { nieuw(a); return; }
        // Niets nieuws: de klant tikte terug. Nog even laten staan — op
        // Android 13 kan onAssociationCreated ná onResume komen.
        final PluginCall c = wacht;
        getBridge().getActivity().getWindow().getDecorView().postDelayed(new Runnable() {
            @Override public void run() { if (wacht == c) klaar(false, null, "geen apparaat gekozen"); }
        }, 1500);
    }

    private void nieuw(String adres) {
        if (wacht == null) return;
        if (adres == null) { klaar(false, null, "koppeling zonder adres"); return; }
        String fout = volg(adres);
        if (fout != null) { klaar(false, adres, fout); return; }
        zetAan(true);
        klaar(true, adres, null);
    }

    private JSObject uitslag(boolean ok, String adres, String reden) {
        JSObject r = new JSObject();
        r.put("ok", ok);
        if (adres != null) r.put("adres", adres);
        if (reden != null) r.put("reden", reden);
        return r;
    }

    private void klaar(boolean ok, String adres, String reden) {
        PluginCall c = wacht;
        wacht = null; voor = null;
        if (c != null) c.resolve(uitslag(ok, adres, reden));
    }

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void ontkoppel(PluginCall call) {
        CompanionDeviceManager m = cdm();
        int los = 0;
        List<String> fouten = new ArrayList<>();
        if (m != null) {
            for (String a : adressen()) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) m.stopObservingDevicePresence(a);
                    m.disassociate(a);
                    los++;
                } catch (Exception e) {
                    Log.w(TAG, "ontkoppelen mislukt: " + a, e);
                    fouten.add(a + ": " + e.getMessage());
                }
            }
        }
        zetAan(false);
        JSObject r = new JSObject();
        r.put("ok", fouten.isEmpty());
        r.put("los", los);
        if (!fouten.isEmpty()) r.put("reden", android.text.TextUtils.join("; ", fouten));
        call.resolve(r);
    }

    @PluginMethod
    public void zet(PluginCall call) {
        boolean a = Boolean.TRUE.equals(call.getBoolean("aan", false));
        zetAan(a);
        // Weer aan: de waarneming opnieuw starten (een update van de app kan
        // hem kwijt zijn).
        String fout = null;
        if (a) for (String adres : adressen()) { String f = volg(adres); if (f != null) fout = f; }
        JSObject r = new JSObject();
        r.put("ok", fout == null);
        r.put("aan", a);
        if (fout != null) r.put("reden", fout);
        call.resolve(r);
    }
}
