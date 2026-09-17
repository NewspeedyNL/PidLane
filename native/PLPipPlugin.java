// ══════════════════════════════════════════════════════════════════
//  PLPipPlugin.java — de brug tussen de app en PLPip (#228)
// ──────────────────────────────────────────────────────────────────
//  Drie methoden, en met opzet niet meer:
//
//    status()      kan dit toestel PiP, staat de vlag aan, zitten we er nu in
//    zetGewenst()  de vlag die pidlane-pip.js uitrekent
//    nu()          meteen naar PiP — voor de begeleide run en het beheerscherm
//
//  Alles wat een oordeel is — mag PiP aan, is er een meting die stil kan
//  vallen, staat de functie uit in de Config — gebeurt in pidlane-pip.js.
//  Deze klasse levert ruwe feiten en de eerlijke reden als iets niet lukt.
//
//  WAAROM EEN REDEN EN GEEN EXCEPTIE. Een afwijzing als exceptie komt in
//  JavaScript in een catch terecht, en dan is er alleen "het lukte niet".
//  Het verschil tussen "dit toestel kent PiP niet" en "de app stond niet meer
//  vooraan" is het verschil tussen een dood spoor en een timingfout — en
//  precies dat onderscheid is wat #228 nodig heeft.
// ══════════════════════════════════════════════════════════════════
package nl.pidlane.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PLPip")
public class PLPipPlugin extends Plugin {

    @Override
    public void load() {
        // Zodat een moduswissel vanuit MainActivity zijn weg terug vindt.
        PLPip.zetLuisteraar(this);
    }

    @Override
    protected void handleOnDestroy() {
        PLPip.zetLuisteraar(null);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("beschikbaar", true);
        r.put("ondersteund", PLPip.ondersteund(getActivity()));
        r.put("gewenst", PLPip.gewenst());
        r.put("inPip", PLPip.inPip(getActivity()));
        call.resolve(r);
    }

    @PluginMethod
    public void zetGewenst(PluginCall call) {
        // Ontbreekt `aan`, dan is dat geen stilzwijgend "ja". Een vlag die
        // aangaat omdat er niets stond is precies het soort stille fout waar
        // dit project een bedradingscontrole voor heeft.
        Boolean aan = call.getBoolean("aan", Boolean.FALSE);
        PLPip.zetGewenst(aan != null && aan);
        JSObject r = new JSObject();
        r.put("gewenst", PLPip.gewenst());
        call.resolve(r);
    }

    @PluginMethod
    public void nu(PluginCall call) {
        String fout = PLPip.start(getActivity());
        JSObject r = new JSObject();
        r.put("ok", fout == null);
        if (fout != null) r.put("reden", fout);
        call.resolve(r);
    }

    /* Van PLPip naar JavaScript. De naam `pipModus` staat ook in
       pidlane-pip.js; test-nativeschil.js legt die twee naast elkaar, want een
       gebeurtenis die onder een andere naam vertrekt dan waarop geluisterd
       wordt is stil — het kleine venster verschijnt dan gewoon nooit. */
    void meldModus(boolean in) {
        JSObject ev = new JSObject();
        ev.put("in", in);
        notifyListeners("pipModus", ev);
    }
}
