package nl.pidlane.app;

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
}
