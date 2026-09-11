// ══════════════════════════════════════════════════════════════════
//  PLMeetdienst.java — de native helft van #18
// ──────────────────────────────────────────────────────────────────
//  WAT DIT IS. Een foreground service met een eigen hartslag. Twee taken,
//  en de tweede is de reden dat dit bestand er nu al staat:
//
//    1. het proces uit de "cached" toestand houden, zodat Android het niet
//       meer bevriest zodra de app naar de achtergrond gaat;
//    2. MÉTEN of dat werkt — elke seconde één tik die niets doet behalve
//       opschrijven dát hij vuurde.
//
//  WAAROM DIE TWEEDE TAAK ER IS. Het issue zegt het zelf: "een plausibele
//  redenering is geen bewijs". Er zijn twee mechanismen die de meetlus kunnen
//  stilzetten en ze vragen om een verschillende oplossing:
//
//    Android bevriest het PROCES (de cached-app freezer). Dan staat alles
//    stil: JavaScript, native code, timers, alles. Hiér helpt een foreground
//    service tegen, want een proces met een draaiende foreground service komt
//    niet in de cached-toestand terecht.
//
//    Chromium knijpt een VERBORGEN pagina af (timer throttling). Dan loopt
//    het proces gewoon door en staat alleen de JavaScript-kant stil. Hier
//    helpt een foreground service NIET tegen, want die zegt niets over
//    zichtbaarheid.
//
//  Van buiten zien die twee er hetzelfde uit: de meetlus doet niets. Twee
//  hartslagen naast elkaar halen ze uit elkaar — deze native hartslag en de
//  JavaScript-hartslag in pidlane-achtergrond.js:
//
//    beide stil        het proces was bevroren; de dienst deed zijn werk niet
//                      (of draaide niet)
//    native loopt,     het proces leefde, maar Chromium hield de WebView stil:
//    JS stil           dan is een foreground service niet genoeg en is
//                      picture-in-picture of een native meetlus de volgende stap
//    beide lopen       opgelost
//
//  Zonder die twee getallen naast elkaar is de keuze tussen die drie
//  richtingen een gok. Mét is het een meting. Dat is precies wat richting B
//  van het issue vraagt, en dit bestand is de helft die JavaScript niet kan
//  leveren.
//
//  DE KLOK IS elapsedRealtime() EN NIET currentTimeMillis(). elapsedRealtime
//  loopt monotoon door tijdens deep sleep en verspringt niet als het toestel
//  zijn tijd bijstelt. Er wordt hier uitsluitend met VERSCHILLEN gerekend, en
//  een klok die kan verspringen maakt van een verschil een verzinsel.
//
//  Dit bestand wordt door .github/workflows/build-apk.yml in de gegenereerde
//  android/-map gezet. De map zelf staat niet in de repo (hij komt elke build
//  uit `cap add android`), dit bestand wél — anders staat er native code in
//  een YAML-heredoc en leest niemand hem ooit terug.
// ══════════════════════════════════════════════════════════════════
package app.pidlane.obd;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Log;

public class PLMeetdienst extends Service {

    public static final String TAG = "PLMeetdienst";
    public static final String KANAAL = "pidlane_meting";
    // 18 als in issue #18. Een willekeurig getal zou hier net zo goed werken,
    // maar dit maakt in een bugreport meteen duidelijk waar de melding vandaan komt.
    public static final int MELDING_ID = 18;
    // Dezelfde seconde als de JavaScript-hartslag in pidlane-achtergrond.js.
    // Ze moeten hetzelfde tempo hebben, anders is "native deed 100 slagen en JS
    // 3" geen vergelijking maar een verschil in instelling.
    public static final long HARTSLAG_MS = 1000L;

    /* De meting van één afwezigheid. Alles in milliseconden op de
       elapsedRealtime-klok; de aanroeper rekent er verschillen mee uit en
       nooit met de absolute waarden. */
    public static final class Meting {
        public boolean draait;      // liep de dienst op het moment van uitlezen
        public long van;            // wanneer nulstel() de teller op nul zette
        public long nu;             // het moment van uitlezen
        public long laatste;        // wanneer de hartslag voor het laatst vuurde
        public long slagen;         // hoe vaak sinds `van`
        public long stilMs;         // de grootste stilte tussen twee slagen
        public long stilVan;        // en wanneer die stilte begon
        public long hartslagMs;     // het tempo, zodat de aanroeper niets hoeft aan te nemen
    }

    private static final Object SLOT = new Object();
    private static boolean sDraait = false;
    private static long sVan = 0L, sLaatste = 0L, sSlagen = 0L, sStilMs = 0L, sStilVan = 0L;

    private HandlerThread draad = null;
    private Handler klopper = null;

    /* Eén hartslag. Net als aan de JavaScript-kant doet hij met opzet niets
       anders dan opschrijven dát hij vuurde: elke regel code hierin is een
       regel die zelf kan blijven hangen, en dan meet de meter zijn eigen last.

       De grootste stilte wordt hier bijgehouden en niet achteraf berekend —
       achteraf is er niets om op terug te kijken, er zijn geen tikken bewaard. */
    static void slag() {
        synchronized (SLOT) {
            long nu = SystemClock.elapsedRealtime();
            long d = nu - sLaatste;
            if (d > sStilMs) { sStilMs = d; sStilVan = sLaatste; }
            sLaatste = nu;
            sSlagen++;
        }
    }

    /* De teller op nul, aan het begin van een afwezigheid. De JavaScript-kant
       roept dit aan bij visibilitychange→hidden: dát is het moment waarop de
       meting begint, en op dat moment loopt de app aantoonbaar nog (de rit van
       09-09 liet zien dat hij daarna nog ~50 s doorliep). */
    public static void nulstel() {
        synchronized (SLOT) {
            sVan = sLaatste = sStilVan = SystemClock.elapsedRealtime();
            sSlagen = 0L;
            sStilMs = 0L;
        }
    }

    /* Wat er sinds nulstel() gebeurd is. Ruwe getallen, met opzet: het OORDEEL
       (hoe lang liep hij door, hoe lang lag hij stil, kwam hij uit zichzelf
       terug) hoort op één plek, en die plek is pidlane-meetdienst.js — daar is
       hij zonder toestel te toetsen. Twee plekken die hetzelfde uitrekenen is
       hier al drie keer een bug geweest. */
    public static Meting meting() {
        Meting m = new Meting();
        synchronized (SLOT) {
            m.draait = sDraait;
            m.van = sVan;
            m.laatste = sLaatste;
            m.slagen = sSlagen;
            m.stilMs = sStilMs;
            m.stilVan = sStilVan;
        }
        m.nu = SystemClock.elapsedRealtime();
        m.hartslagMs = HARTSLAG_MS;
        return m;
    }

    public static boolean draait() {
        synchronized (SLOT) { return sDraait; }
    }

    private final Runnable tik = new Runnable() {
        @Override public void run() {
            slag();
            Handler h = klopper;
            if (h != null) h.postDelayed(this, HARTSLAG_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        kanaal();
        // Een eigen draad, zodat de hartslag niet achter het werk van de
        // hoofddraad aan hoeft te sluiten. Wordt het proces bevroren, dan staat
        // deze draad óók stil — en dat is precies wat er gemeten moet worden.
        draad = new HandlerThread("pidlane-hartslag");
        draad.start();
        klopper = new Handler(draad.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Onvoorwaardelijk, ook bij een herstart met een leeg intent: een
        // service die na startForegroundService() niet binnen vijf seconden
        // startForeground() aanroept, wordt door Android afgeschoten met een
        // ANR die nergens naar de oorzaak wijst.
        try {
            Notification n = melding();
            if (Build.VERSION.SDK_INT >= 34) {
                // Android 14 eist het type bij het starten, en het moet
                // overeenkomen met android:foregroundServiceType in het
                // manifest. Staat daar iets anders, dan gooit het systeem
                // een SecurityException.
                startForeground(MELDING_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            } else {
                startForeground(MELDING_ID, n);
            }
        } catch (Exception e) {
            // Geen stille catch: komt de melding er niet, dan draait deze
            // dienst niet als foreground service en meet de hartslag dus iets
            // anders dan hij belooft. Dat hoort in logcat te staan.
            Log.e(TAG, "startForeground() geweigerd — de dienst draait niet als foreground service (#18)", e);
            stopSelf();
            return START_NOT_STICKY;
        }

        synchronized (SLOT) { sDraait = true; }
        nulstel();
        if (klopper != null) {
            klopper.removeCallbacks(tik);
            klopper.postDelayed(tik, HARTSLAG_MS);
        }
        Log.i(TAG, "meetdienst gestart — hartslag elke " + HARTSLAG_MS + " ms (#18)");
        // START_STICKY: schiet Android hem toch af, dan komt hij terug. Het
        // lege intent bij zo'n herstart is hierboven al afgevangen.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        synchronized (SLOT) { sDraait = false; }
        try {
            if (klopper != null) klopper.removeCallbacks(tik);
            if (draad != null) draad.quitSafely();
        } catch (Exception e) {
            Log.w(TAG, "hartslagdraad niet netjes gestopt (#18)", e);
        }
        klopper = null;
        draad = null;
        Log.i(TAG, "meetdienst gestopt (#18)");
        super.onDestroy();
    }

    /* De app uit het overzicht geveegd. Dan is er geen WebView meer, dus geen
       meting, dus ook geen reden om nog te draaien.

       Zonder deze override blijft de dienst staan — en START_STICKY zet hem
       zelfs terug — met een melding die zegt dat PidLane doormeet terwijl er
       niets meer is om mee te meten. Een melding die iets belooft wat er niet
       staat is in dit project al vaker de fout geweest; hier zou hij bovendien
       niet weg te krijgen zijn zonder de app opnieuw te openen. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.i(TAG, "app uit het overzicht geveegd — de meetdienst stopt mee (#18)");
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        // Niet te binden. De plugin praat via de statische teller hierboven en
        // start/stopt de dienst met een intent; een binding zou een tweede weg
        // naar dezelfde toestand zijn.
        return null;
    }

    private void kanaal() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) {
            Log.w(TAG, "geen NotificationManager — de melding komt er niet, en dan mag deze dienst niet draaien (#18)");
            return;
        }
        // LOW en niet DEFAULT: deze melding hoort er te staan zolang de meting
        // loopt, maar hij hoeft niet te piepen of in beeld te springen.
        NotificationChannel k = new NotificationChannel(KANAAL, "Meting op de achtergrond",
                NotificationManager.IMPORTANCE_LOW);
        k.setDescription("Zichtbaar zolang PidLane met de OBD2-adapter verbonden is en doormeet.");
        k.setShowBadge(false);
        nm.createNotificationChannel(k);
    }

    private Notification melding() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = (Build.VERSION.SDK_INT >= 26)
                ? new Notification.Builder(this, KANAAL)
                : new Notification.Builder(this);

        b.setContentTitle("PidLane meet door")
         .setContentText("Verbonden met de OBD2-adapter. De meting loopt ook als je wegschakelt.")
         .setSmallIcon(android.R.drawable.stat_notify_sync)
         .setContentIntent(pi)
         .setOngoing(true)
         .setWhen(System.currentTimeMillis());
        b.setVisibility(Notification.VISIBILITY_PUBLIC);
        return b.build();
    }
}
