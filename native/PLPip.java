// ══════════════════════════════════════════════════════════════════
//  PLPip.java — de native helft van "de meting in beeld houden" (#228)
// ──────────────────────────────────────────────────────────────────
//  WAAROM DIT BESTAAND NAAST DE PLUGIN STAAT. Android laat een app alleen
//  naar picture-in-picture gaan zolang de activiteit nog vooraan is. Het
//  moment waarop dat kan is onUserLeaveHint(): de gebruiker drukt op home of
//  schakelt weg, en de activiteit is dan nog nét resumed. Vanuit JavaScript
//  is dat moment niet te halen — `visibilitychange` komt ná de wissel, en dan
//  weigert het systeem met een IllegalStateException.
//
//  Daarom staat hier een VLAG en geen besluit. pidlane-pip.js rekent uit of
//  PiP nu gewenst is (Config-schakelaar, verbonden, geen demo, sensoren
//  geselecteerd) en zet die uitkomst hier neer. Deze klasse doet één ding:
//  als de gebruiker wegschakelt en de vlag staat aan, vraag PiP aan.
//
//  Native interpreteert niets. Dezelfde scheiding als bij PLMeetdienst (#18),
//  en om dezelfde reden: een oordeel dat hier staat is niet in node te
//  toetsen, en dan is de enige manier om het na te kijken een rit.
//
//  WAT HIER WEL EEN OORDEEL IS — en dat kan niet anders: of het toestel PiP
//  überhaupt kan. Dat is een eigenschap van het toestel (Android 8+ én de
//  systeemfunctie aanwezig) en JavaScript kan er niet bij. Het antwoord gaat
//  daarom mee terug in status(), zodat de app het verschil kan MELDEN tussen
//  "staat uit", "deze schil kan het niet" en "dit toestel kan het niet".
// ══════════════════════════════════════════════════════════════════
package nl.pidlane.app;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import android.util.Rational;

public final class PLPip {

    private static final String TAG = "PLPip";

    /* De verhouding van het venster. 16:9 is wat Android zelf als voorbeeld
       aanhoudt en wat een telefoon zonder morren accepteert; een extreme
       verhouding wordt door het systeem stilletjes bijgeknipt. Het kleine
       venster in pidlane-pip.js is op deze vorm getekend. */
    private static final int BREED = 16;
    private static final int HOOG  = 9;

    /* De vlag die de app zet. `volatile` omdat hij op de bridge-thread
       geschreven en op de UI-thread gelezen wordt. */
    private static volatile boolean gewenst = false;

    /* De plugin, zodat een moduswissel terug kan naar JavaScript. Mag null
       zijn: dan is er niemand om het aan te vertellen en gaat de wissel
       gewoon door. */
    private static volatile PLPipPlugin luisteraar = null;

    private PLPip() { }

    static void zetLuisteraar(PLPipPlugin p) { luisteraar = p; }

    public static void zetGewenst(boolean aan) {
        gewenst = aan;
        Log.i(TAG, "PiP gewenst: " + aan);
    }

    public static boolean gewenst() { return gewenst; }

    /* Kan dit toestel het? Twee voorwaarden, en ze zijn allebei nodig:
       de API bestaat pas vanaf Android 8 (API 26), en een toestel mag de
       functie weglaten — dan is FEATURE_PICTURE_IN_PICTURE afwezig en gooit
       enterPictureInPictureMode() een IllegalStateException. */
    public static boolean ondersteund(Activity a) {
        if (a == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try {
            return a.getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        } catch (Exception e) {
            Log.w(TAG, "kan de PiP-systeemfunctie niet opvragen", e);
            return false;
        }
    }

    public static boolean inPip(Activity a) {
        if (a == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try { return a.isInPictureInPictureMode(); }
        catch (Exception e) { Log.w(TAG, "kan de PiP-stand niet opvragen", e); return false; }
    }

    /* De gebruiker schakelt weg. Dit is het enige moment waarop het systeem
       PiP toestaat, dus hier valt de beslissing — op de vlag die de app heeft
       gezet, en op niets anders. */
    public static void leaveHint(Activity a) {
        if (!gewenst) return;
        if (inPip(a)) return;
        start(a);
    }

    /* PiP aanvragen. Geeft de reden terug in plaats van een exceptie omhoog te
       gooien: "het lukte niet" is geen bevinding, "dit toestel kent de functie
       niet" wel. Null = gelukt. */
    public static String start(Activity a) {
        if (a == null) return "geen activiteit";
        if (!ondersteund(a)) return "dit toestel of deze Android-versie kent picture-in-picture niet";
        try {
            PictureInPictureParams.Builder b = new PictureInPictureParams.Builder();
            b.setAspectRatio(new Rational(BREED, HOOG));
            boolean ok = a.enterPictureInPictureMode(b.build());
            if (!ok) return "het systeem wees het venster af";
            return null;
        } catch (IllegalStateException e) {
            // De klassieke: aangevraagd terwijl de activiteit niet meer vooraan
            // stond. Dat is precies waarom de vlag bestaat, dus als dit hier
            // staat is er iets mis met het MOMENT en niet met het toestel.
            Log.w(TAG, "PiP geweigerd — de activiteit stond niet meer vooraan", e);
            return "de app stond niet meer vooraan toen het venster werd aangevraagd";
        } catch (Exception e) {
            Log.w(TAG, "PiP mislukt", e);
            return String.valueOf(e.getMessage());
        }
    }

    /* Wordt door MainActivity aangeroepen bij elke moduswissel. Doorgeven aan
       JavaScript, want daar hangt het kleine venster aan — en de app-log, die
       achteraf de enige plek is waar staat of PiP tijdens een rit aanging. */
    public static void modus(boolean in) {
        Log.i(TAG, "PiP-modus: " + in);
        PLPipPlugin p = luisteraar;
        if (p != null) p.meldModus(in);
    }
}
