#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
// plspppatch.js — de SPP-plugin laat geen draaiende leesdraden meer achter (#352)
// ──────────────────────────────────────────────────────────────────
// WAT ER MIS IS IN DE PLUGIN. `@ascentio-it/capacitor-bluetooth-serial`
// 8.0.1 maakt bij elke `connect()` een BluetoothConnection. De constructor doet
// de blokkerende `socket.connect()`; mislukt die, dan staat de status op
// NOT_CONNECTED — en daarna volgt tóch `start()`. De leesdraad is:
//
//     while (true) { if (status == CONNECTED) { … } }
//
// Bij NOT_CONNECTED is dat een lege lus zonder pauze en zonder uitgang: één
// processorkern vol, tot het proces stopt. `disconnect()` doet voor zo'n
// verbinding alleen `interrupt()`, en daar kijkt de lus niet naar. Elke
// mislukte verbindpoging kost dus een kern voor de rest van de sessie.
//
// Gemeten op 30-09-2026: na een herverbinding bij een dode socket was `ATH0`
// 166 ms in plaats van 6, de telefoon werd warm en het batterijverbruik hoog.
// Alleen de app afsluiten hielp. Dezelfde lus zit in élke fork van deze
// plugin (@e-is, @fmesasc, @speedengineering, @bintangf, @shoerofi en de
// herschreven @brmaschio) — overstappen lost het niet op.
//
// WAT DEZE PATCH DOET, EN NIETS MEER
//   1. connect(): een mislukte poging krijgt geen draad en komt niet in de
//      lijst; een oude verbinding op hetzelfde adres wordt eerst gesloten
//   2. de leesdraad stopt zodra de status niet meer CONNECTED is, `status`
//      is volatile, en -1 (einde van de stroom) is een gesloten socket in
//      plaats van een StringIndexOutOfBoundsException die de draad sloopt
//   3. een teller van lopende leesdraden, en een methode plPatch() die de app
//      laat zien dat deze patch in de APK zit
//   4. een schakelaar voor de proef: plPatch({ aan: false }) zet het oude
//      gedrag terug tot de app herstart. Zo meet dezelfde APK beide kanten,
//      op dezelfde telefoon — anders is er na deze build geen tegenproef meer
//
// Met opzet NIET: write() die een fout slikt. Dat verandert wanneer de app een
// dode socket ziet, en is dus gedrag van de herverbinding — een eigen stap.
//
// WAAROM EEN SCRIPT EN GEEN FORK. Een fork is een tweede pakket om bij te
// houden naast een baan. Dit is een handvol vervangingen op vaste ankers: past
// een anker niet precies één keer, dan stopt het script met exit 1 en de naam
// van het anker erbij. Een plugin-update breekt de build dus hardop, in plaats
// van stil een APK zonder patch te bouwen.
//
// GEBRUIK
//   node plspppatch.js node_modules/@ascentio-it/capacitor-bluetooth-serial
//
// Tweede keer draaien doet niets: een bestand met het merkteken wordt
// overgeslagen, en dat staat erbij.
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

const MERK = 'PIDLANE-PATCH #352';
const VERSIE = 'PIDLANE-352-1';

const SERVICE = 'android/src/main/java/com/bluetoothserial/BluetoothSerialService.java';
const PLUGIN = 'android/src/main/java/com/bluetoothserial/plugin/BluetoothSerialPlugin.java';

// Elke vervanging: een naam (voor de foutmelding), het anker zoals het in de
// plugin staat, en wat ervoor in de plaats komt.
const PATCHES = {};

PATCHES[SERVICE] = [
  {
    naam: 'import AtomicInteger',
    anker: 'import java.util.UUID;\n',
    nieuw: 'import java.util.UUID;\nimport java.util.concurrent.atomic.AtomicInteger;\n'
  },
  {
    naam: 'teller van lopende leesdraden',
    anker: '    private static final String TAG = "BluetoothSerialService";\n',
    nieuw: '    private static final String TAG = "BluetoothSerialService";\n' +
           '    // ' + MERK + ': hoeveel leesdraden er nu lopen. Hoort 0 of 1 te zijn.\n' +
           '    private static final AtomicInteger LEESDRADEN = new AtomicInteger();\n' +
           '    // De schakelaar voor de proef op de telefoon: uit = het oude gedrag, zodat\n' +
           '    // dezelfde APK beide kanten kan meten. Alleen in het geheugen: elke\n' +
           '    // start van de app begint met de patch aan.\n' +
           '    private static volatile boolean PATCH_AAN = true;\n'
  },
  {
    naam: 'connect(): geen draad bij een mislukte poging',
    anker:
      '    private void connect(BluetoothDevice device, boolean secure, BluetoothSerialPlugin serial) {\n' +
      '        BluetoothConnection connection = new BluetoothConnection(device, secure, serial);\n' +
      '        connection.start();\n' +
      '\n' +
      '        connections.put(device.getAddress(), connection);\n' +
      '    }\n',
    nieuw:
      '    // ' + MERK + ': een mislukte poging kreeg hier toch start(), en die draad\n' +
      '    // draaide dan leeg rond tot het proces stopte. En een oude verbinding op\n' +
      '    // hetzelfde adres werd vervangen zonder hem te sluiten.\n' +
      '    private void connect(BluetoothDevice device, boolean secure, BluetoothSerialPlugin serial) {\n' +
      '        if (!PATCH_AAN) {\n' +
      '            // Het oude gedrag, alleen voor de proef (#352): start() ook na een\n' +
      '            // mislukte poging, en de oude verbinding niet sluiten.\n' +
      '            BluetoothConnection c = new BluetoothConnection(device, secure, serial);\n' +
      '            c.oudGedrag = true;\n' +
      '            c.start();\n' +
      '            connections.put(device.getAddress(), c);\n' +
      '            return;\n' +
      '        }\n' +
      '        BluetoothConnection oud = connections.remove(device.getAddress());\n' +
      '        if (oud != null) {\n' +
      '            oud.sluit();\n' +
      '        }\n' +
      '        BluetoothConnection connection = new BluetoothConnection(device, secure, serial);\n' +
      '        if (!connection.verbonden()) {\n' +
      '            connection.sluit();\n' +
      '            return;\n' +
      '        }\n' +
      '        connection.setName("PLSpp-lees");\n' +
      '        connections.put(device.getAddress(), connection);\n' +
      '        connection.start();\n' +
      '    }\n' +
      '\n' +
      '    public static int leesdraden() {\n' +
      '        return LEESDRADEN.get();\n' +
      '    }\n' +
      '\n' +
      '    public int verbindingen() {\n' +
      '        return connections.size();\n' +
      '    }\n' +
      '\n' +
      '    public static void zetPatch(boolean aan) {\n' +
      '        PATCH_AAN = aan;\n' +
      '    }\n' +
      '\n' +
      '    public static boolean patchAan() {\n' +
      '        return PATCH_AAN;\n' +
      '    }\n'
  },
  {
    naam: 'status volatile',
    anker: '        private ConnectionStatus status;\n',
    nieuw: '        private volatile ConnectionStatus status;\n' +
           '        // ' + MERK + ': true = de lege lus van vóór de patch, voor de proef.\n' +
           '        boolean oudGedrag = false;\n'
  },
  {
    naam: 'leesdraad stopt als de verbinding weg is',
    anker:
      '            Log.i(TAG, "BEGIN connectedThread");\n' +
      '            byte[] bytesBuffer = new byte[1024];\n' +
      '\n' +
      '            // Keep listening to the InputStream while connected\n' +
      '            while (true) {\n' +
      '                if (status == ConnectionStatus.CONNECTED) {\n' +
      '                    try {\n' +
      '                        // Read from the InputStream\n' +
      '                        int length = socketInputStream.read(bytesBuffer);\n' +
      '                        String data = new String(bytesBuffer, 0, length);\n' +
      '                        appendToBuffer(data);\n' +
      '                    } catch (IOException e) {\n' +
      '                        Log.e(TAG, "disconnected", e);\n' +
      '                        disconnect();\n' +
      '                        break;\n' +
      '                    }\n' +
      '                }\n' +
      '            }\n' +
      '            Log.i(TAG, "END connectedThread");\n',
    nieuw:
      '            Log.i(TAG, "BEGIN connectedThread");\n' +
      '            LEESDRADEN.incrementAndGet();\n' +
      '            byte[] bytesBuffer = new byte[1024];\n' +
      '            try {\n' +
      '                // ' + MERK + ': stoppen zodra de verbinding weg is, in plaats\n' +
      '                // van leeg rond te draaien. En -1 is een gesloten socket.\n' +
      '                while (oudGedrag || (status == ConnectionStatus.CONNECTED && !isInterrupted())) {\n' +
      '                    // Met de patch komt hier nooit iets anders dan CONNECTED\n' +
      '                    // langs; zonder (de proef) is dit de oude lege lus.\n' +
      '                    if (status != ConnectionStatus.CONNECTED) continue;\n' +
      '                    try {\n' +
      '                        int length = socketInputStream.read(bytesBuffer);\n' +
      '                        if (length < 0) {\n' +
      '                            Log.i(TAG, "einde van de stroom");\n' +
      '                            disconnect();\n' +
      '                            break;\n' +
      '                        }\n' +
      '                        String data = new String(bytesBuffer, 0, length);\n' +
      '                        appendToBuffer(data);\n' +
      '                    } catch (IOException e) {\n' +
      '                        Log.e(TAG, "disconnected", e);\n' +
      '                        disconnect();\n' +
      '                        break;\n' +
      '                    }\n' +
      '                }\n' +
      '            } finally {\n' +
      '                LEESDRADEN.decrementAndGet();\n' +
      '            }\n' +
      '            Log.i(TAG, "END connectedThread");\n'
  },
  {
    naam: 'disconnect() zet de status om',
    anker:
      '        public boolean disconnect() {\n' +
      '            try {\n' +
      '                socket.close();\n',
    nieuw:
      '        public boolean disconnect() {\n' +
      '            status = ConnectionStatus.NOT_CONNECTED;\n' +
      '            if (socket == null) {\n' +
      '                return true;\n' +
      '            }\n' +
      '            try {\n' +
      '                socket.close();\n'
  },
  {
    naam: 'sluit() en verbonden()',
    anker: '        public void reconnect() {\n',
    nieuw:
      '        // ' + MERK + '\n' +
      '        void sluit() {\n' +
      '            disconnect();\n' +
      '            interrupt();\n' +
      '        }\n' +
      '\n' +
      '        boolean verbonden() {\n' +
      '            return status == ConnectionStatus.CONNECTED;\n' +
      '        }\n' +
      '\n' +
      '        public void reconnect() {\n'
  }
];

PATCHES[PLUGIN] = [
  {
    naam: 'plPatch()',
    anker: '    @PluginMethod\n    public void isConnected(PluginCall call) {\n',
    nieuw:
      '    // ' + MERK + ': laat de app zien dat deze patch in de APK zit, en hoeveel\n' +
      '    // leesdraden er nu lopen. Zonder patch bestaat deze methode niet.\n' +
      '    @PluginMethod\n' +
      '    public void plPatch(PluginCall call) {\n' +
      '        // { aan: false } zet het oude gedrag terug tot de app herstart (de proef).\n' +
      '        Boolean aan = call.getBoolean("aan", null);\n' +
      '        if (aan != null) BluetoothSerialService.zetPatch(aan);\n' +
      '        JSObject r = new JSObject();\n' +
      '        r.put("aan", BluetoothSerialService.patchAan());\n' +
      '        r.put("patch", "' + VERSIE + '");\n' +
      '        r.put("leesdraden", BluetoothSerialService.leesdraden());\n' +
      '        r.put("verbindingen", getService().verbindingen());\n' +
      '        call.resolve(r);\n' +
      '    }\n' +
      '\n' +
      '    @PluginMethod\n    public void isConnected(PluginCall call) {\n'
  }
];

function _tel(tekst, stuk) {
  let n = 0, i = 0;
  while ((i = tekst.indexOf(stuk, i)) !== -1) { n++; i += stuk.length; }
  return n;
}

/* Puur: tekst in, tekst uit. Gooit met de naam van het anker erbij als er
   iets niet precies één keer past. Een bestand dat het merkteken al draagt
   komt ongewijzigd terug, met `al: true`. */
function pas(tekst, lijst) {
  if (tekst.indexOf(MERK) !== -1) return { tekst: tekst, al: true };
  // CRLF zou elk anker laten missen met een melding die niet naar de oorzaak
  // wijst. Liever hier zeggen wat het is.
  if (tekst.indexOf('\r\n') !== -1) throw new Error('bestand heeft CRLF-regeleinden; de ankers gaan uit van LF');
  let uit = tekst;
  for (const p of lijst) {
    const n = _tel(uit, p.anker);
    if (n !== 1) throw new Error('anker "' + p.naam + '" past ' + n + ' keer (verwacht: 1)');
    uit = uit.replace(p.anker, function () { return p.nieuw; });
  }
  return { tekst: uit, al: false };
}

function patchMap(map) {
  const regels = [];
  for (const rel of Object.keys(PATCHES)) {
    const f = path.join(map, rel);
    if (!fs.existsSync(f)) throw new Error(rel + ' bestaat niet in ' + map);
    const r = pas(fs.readFileSync(f, 'utf8'), PATCHES[rel]);
    if (r.al) { regels.push('al gepatcht: ' + rel); continue; }
    fs.writeFileSync(f, r.tekst);
    regels.push('gepatcht: ' + rel + ' (' + PATCHES[rel].length + ' vervanging(en))');
  }
  return regels;
}

module.exports = { MERK: MERK, VERSIE: VERSIE, SERVICE: SERVICE, PLUGIN: PLUGIN, PATCHES: PATCHES, pas: pas, patchMap: patchMap };

if (require.main === module) {
  const map = process.argv[2];
  if (!map) {
    console.error('gebruik: node plspppatch.js <map van @ascentio-it/capacitor-bluetooth-serial>');
    process.exit(2);
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(map, 'package.json'), 'utf8'));
    console.log('plugin: ' + pkg.name + ' ' + pkg.version);
    patchMap(map).forEach(function (r) { console.log(r); });
    console.log('SPP-patch (#352) ' + VERSIE + ' staat erin.');
  } catch (e) {
    console.error('FOUT: SPP-patch (#352) niet toegepast — ' + e.message);
    console.error('      Kijk of de plugin van versie veranderd is; de ankers staan in plspppatch.js.');
    process.exit(1);
  }
}
