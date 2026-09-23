package nl.pidlane.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* De app-kant van PLRender (#229): na een herstart vraagt pidlane-render.js
   of er een rendercrash aan voorafging, zodat het gat in de meting zijn
   oorzaak draagt in plaats van als busstilte te lezen. */
@CapacitorPlugin(name = "PLRender")
public class PLRenderPlugin extends Plugin {

    @PluginMethod
    public void laatste(PluginCall call) {
        long[] l = PLRender.neemLaatste(getContext());
        JSObject r = new JSObject();
        r.put("moment", l[0]);
        r.put("crash", l[1] == 1L);
        call.resolve(r);
    }

    /* De proefcrash (#229): een rendercrash op bestelling, om de afvang op een
       echt toestel te kunnen zien. chrome://crash is de manier die de
       Android-documentatie zelf noemt. Vanuit JavaScript lukt het niet: de
       navigatie gaat langs Capacitor, en die stuurt elk adres buiten
       allowNavigation naar buiten. Eerst antwoorden, dan crashen — na de
       crash is er geen bridge meer om het antwoord over te sturen. */
    @PluginMethod
    public void proef(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> {
            try {
                getBridge().getWebView().loadUrl("chrome://crash");
            } catch (Exception e) {
                Log.e("PLRender", "proefcrash niet gestart", e);
            }
        });
    }
}
