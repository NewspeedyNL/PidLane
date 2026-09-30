package nl.pidlane.app;

import android.system.Os;
import android.system.OsConstants;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/* PLDraden (#352): welke draden van dit proces gebruiken nu processortijd?

   WAAROM. De SPP-plugin laat bij elke mislukte verbindpoging een leesdraad
   achter die leeg ronddraait. Vanuit JavaScript is dat alleen indirect te
   zien — alles wordt trager, de telefoon warm. Deze meting kijkt er recht
   naar: per draad de processortijd over een venster, uit /proc/self/task.
   Dat werkt ook met de ONGEPATCHTE plugin, en is dus de meting die laat zien
   of de patch iets doet.

   HOE. /proc/self/task/<tid>/stat twee keer lezen, `ms` uit elkaar; utime +
   stime (velden 14 en 15) in klokticks. Het verschil gedeeld door het venster
   is het deel van één kern dat die draad gebruikte. De naam van de draad
   (comm, hoogstens 15 tekens) staat tussen haakjes en kan zelf haakjes en
   spaties bevatten — daarom na de LAATSTE ')' verder tellen.

   Daarnaast de Java-kant: welke draden staan in de run() van de
   BluetoothConnection van de plugin. Hun namen koppelen aan de CPU-meting
   zegt of een leesdraad wacht (hoort zo) of ronddraait (de fout).

   Op een eigen draad, niet op die van de plugins: Capacitor draait alle
   plugin-aanroepen na elkaar op één draad, en een seconde slapen zou dan ook
   de SPP-verbinding een seconde stilzetten. */
@CapacitorPlugin(name = "PLDraden")
public class PLDradenPlugin extends Plugin {

    private static final String TAG = "PLDraden";

    @PluginMethod
    public void meet(PluginCall call) {
        final int ms = Math.max(200, Math.min(5000, call.getInt("ms", 1000)));
        new Thread(() -> {
            try {
                Map<String, long[]> a = lees();
                long t0 = System.nanoTime();
                Thread.sleep(ms);
                Map<String, long[]> b = lees();
                double venster = (System.nanoTime() - t0) / 1e9;
                long hz = Os.sysconf(OsConstants._SC_CLK_TCK);
                if (hz <= 0) hz = 100;

                Map<String, Double> pct = new HashMap<>();
                double totaal = 0;
                for (Map.Entry<String, long[]> e : b.entrySet()) {
                    long[] na = e.getValue(), voor = a.get(e.getKey());
                    long ticks = na[0] - (voor == null ? na[0] : voor[0]);
                    double p = ticks * 100.0 / hz / venster;
                    pct.put(e.getKey(), p);
                    totaal += p;
                }

                List<String> tids = new ArrayList<>(pct.keySet());
                tids.sort((x, y) -> Double.compare(pct.get(y), pct.get(x)));
                JSArray draden = new JSArray();
                for (String tid : tids) {
                    if (draden.length() >= 12 || pct.get(tid) < 1.0) break;
                    JSObject d = new JSObject();
                    d.put("tid", tid);
                    d.put("naam", naamVan(tid));
                    d.put("pct", Math.round(pct.get(tid)));
                    draden.put(d);
                }

                // De Java-kant: draden in BluetoothConnection.run() van de plugin.
                // Tellen PER DRAAD, niet per naam (30-09-2026): met de patch heten
                // alle leesdraden "PLSpp-lees", en optellen per naam maakte van één
                // ronddraaiende draad er evenveel als er leesdraden waren.
                java.util.Set<String> namen = new java.util.HashSet<>();
                int levend = 0;
                for (Map.Entry<Thread, StackTraceElement[]> e : Thread.getAllStackTraces().entrySet()) {
                    boolean lees = false;
                    for (StackTraceElement s : e.getValue()) {
                        if (s.getClassName().endsWith("$BluetoothConnection") && "run".equals(s.getMethodName())) lees = true;
                    }
                    if (!lees) continue;
                    levend++;
                    String n = e.getKey().getName();
                    namen.add(n.length() > 15 ? n.substring(0, 15) : n);
                }
                JSArray spp = new JSArray();
                int draait = 0;
                for (String tid : tids) {
                    if (!namen.contains(naamVan(tid))) continue;
                    double p = pct.get(tid);
                    boolean rond = p >= 50;
                    if (rond) draait++;
                    JSObject d = new JSObject();
                    d.put("tid", tid);
                    d.put("naam", naamVan(tid));
                    d.put("pct", Math.round(p));
                    d.put("draait", rond);
                    spp.put(d);
                }

                JSObject r = new JSObject();
                r.put("ms", Math.round(venster * 1000));
                r.put("hz", hz);
                r.put("kernen", Runtime.getRuntime().availableProcessors());
                r.put("totaalPct", Math.round(totaal));
                r.put("aantal", b.size());
                r.put("draden", draden);
                r.put("sppLevend", levend);
                r.put("sppDraait", draait);
                r.put("spp", spp);
                // Welk proces dit is. Een nieuwe WebView in hetzelfde proces (de app
                // weggeveegd terwijl de meetdienst hem in leven hield) leegt de
                // sessionStorage, maar niet de draden. Alleen pid + starttijd zeggen
                // of het proces werkelijk nieuw is.
                r.put("pid", android.os.Process.myPid());
                r.put("procesStart", android.os.Process.getStartElapsedRealtime());
                call.resolve(r);
            } catch (Exception e) {
                Log.e(TAG, "draadmeting mislukt", e);
                call.reject("draadmeting mislukt: " + e.getMessage());
            }
        }, "PLDraden-meet").start();
    }

    /* Het proces beëindigen (30-09-2026). Wegvegen bij "recente apps" is
       niet genoeg: de meetdienst houdt het proces in leven, en daarmee elke
       draad die er ronddraait. Eerst antwoorden, dan stoppen — na het stoppen
       is er geen bridge meer om te antwoorden. */
    @PluginMethod
    public void beeindig(PluginCall call) {
        call.resolve();
        new Thread(() -> {
            try {
                Thread.sleep(300);
            } catch (InterruptedException e) {
                Log.w(TAG, "wachten vóór het beëindigen onderbroken", e);
            }
            Log.i(TAG, "proces wordt beëindigd op verzoek (#352)");
            android.os.Process.killProcess(android.os.Process.myPid());
        }, "PLDraden-stop").start();
    }

    private final Map<String, String> _namen = new java.util.concurrent.ConcurrentHashMap<>();

    private String naamVan(String tid) {
        String n = _namen.get(tid);
        return n == null ? "?" : n;
    }

    // java.nio.file bestaat pas vanaf API 26; dit werkt op elke versie.
    private static String leesBestand(File f) throws IOException {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream uit = new ByteArrayOutputStream();
            byte[] buf = new byte[512];
            int n;
            while ((n = in.read(buf)) > 0) uit.write(buf, 0, n);
            return new String(uit.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /* tid → {utime + stime}. Een draad die tussen het lijstje en het lezen
       ophoudt, valt gewoon weg; dat is geen fout. */
    private Map<String, long[]> lees() {
        Map<String, long[]> uit = new HashMap<>();
        File[] taken = new File("/proc/self/task").listFiles();
        if (taken == null) return uit;
        for (File t : taken) {
            String tekst;
            try {
                tekst = leesBestand(new File(t, "stat"));
            } catch (Exception e) {
                Log.d(TAG, "draad " + t.getName() + " verdwenen tijdens het lezen");
                continue;
            }
            int open = tekst.indexOf('('), dicht = tekst.lastIndexOf(')');
            if (open < 0 || dicht < open) continue;
            _namen.put(t.getName(), tekst.substring(open + 1, dicht));
            String[] v = tekst.substring(dicht + 2).split(" ");
            // Na ") " is v[0] het derde veld (state); utime is veld 14, stime 15.
            if (v.length < 13) continue;
            try {
                uit.put(t.getName(), new long[]{ Long.parseLong(v[11]) + Long.parseLong(v[12]) });
            } catch (NumberFormatException e) {
                Log.w(TAG, "stat van draad " + t.getName() + " onleesbaar", e);
            }
        }
        return uit;
    }
}
