// ══════════════════════════════════════════════════════════════════
// test-spppatch.js — een mislukte verbindpoging laat geen draad achter (#352)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// De SPP-plugin start bij elke connect() een leesdraad, ook als de poging
// mislukt. Die draad draait dan leeg rond in while(true) en kost een kern
// tot het proces stopt. plspppatch.js patcht dat in node_modules vóór de
// APK-build. Deze test voert dat script uit op de originele bestanden in
// native/spp-plugin-8.0.1/, en toetst dan twee dingen:
//
//   1. DE ANKERS. Elke vervanging past precies één keer, een tweede keer
//      draaien verandert niets, en een anker dat niet past stopt het script
//      met de naam erbij (geen stille build zonder patch).
//   2. HET GEDRAG, met javac en een paar nagebouwde Android-klassen. Een
//      connect() die mislukt, een die lukt, en een disconnect() — eerst op
//      het ORIGINEEL, dan op de gepatchte versie. Het origineel moet een
//      draaiende draad achterlaten; anders meet deze test niets. Dat is de
//      tegenproef, en hij zit in de toets zelf.
//
// Wat hier NIET getoetst wordt: of Android zelf een mislukte socket.connect()
// zo afhandelt als de nagebouwde klasse. Dat blijkt uit de adminknoppen
// (pidlane-sppproef.js) op een echte telefoon.
//
// Geen javac op dit toestel? Dan LET OP en de ankertoets draait nog wel.
//
// Draaien vanuit public/:  node test-spppatch.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

let fouten = 0;
function eis(waar, wat) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat);
  fouten++;
}
function letop(wat) { console.log('  LET OP ' + wat); }

const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'plspppatch.js'));
const BRON = path.join(ROOT, 'native', 'spp-plugin-8.0.1');
const ORIG = {};
ORIG[P.SERVICE] = fs.readFileSync(path.join(BRON, 'BluetoothSerialService.java'), 'utf8');
ORIG[P.PLUGIN] = fs.readFileSync(path.join(BRON, 'BluetoothSerialPlugin.java'), 'utf8');

console.log('── 1. de versie van het proefmateriaal ──');
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const alle = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
  const v = alle['@ascentio-it/capacitor-bluetooth-serial'];
  eis(v === '8.0.1', 'package.json pint de plugin op 8.0.1, dezelfde versie als native/spp-plugin-8.0.1/ (staat op ' + v + ')');
}

console.log('── 2. de ankers ──');
const GEPATCHT = {};
for (const rel of Object.keys(P.PATCHES)) {
  let r = null, fout = null;
  try { r = P.pas(ORIG[rel], P.PATCHES[rel]); } catch (e) { fout = e; }
  eis(!fout && r && !r.al, path.basename(rel) + ': alle ' + P.PATCHES[rel].length + ' ankers passen precies één keer' + (fout ? ' — ' + fout.message : ''));
  if (!r) continue;
  GEPATCHT[rel] = r.tekst;
  eis(r.tekst.indexOf(P.MERK) !== -1, path.basename(rel) + ': het merkteken staat erin');
  const twee = P.pas(r.tekst, P.PATCHES[rel]);
  eis(twee.al && twee.tekst === r.tekst, path.basename(rel) + ': een tweede keer patchen verandert niets');
}
{
  const s = GEPATCHT[P.SERVICE] || '';
  eis(s.indexOf('while (true)') === -1, 'de lege while(true)-lus is weg uit de service');
  eis(/while \(oudGedrag \|\| \(status == ConnectionStatus\.CONNECTED && !isInterrupted\(\)\)\)/.test(s), 'de leesdraad loopt zolang hij verbonden is (tenzij de proef het oude gedrag vraagt)');
  eis(/private volatile ConnectionStatus status;/.test(s), 'status is volatile');
  const pl = GEPATCHT[P.PLUGIN] || '';
  eis(pl.indexOf('public void plPatch(PluginCall call)') !== -1 && pl.indexOf('"' + P.VERSIE + '"') !== -1 && /BluetoothSerialService\.zetPatch\(aan\)/.test(pl),
      'de plugin heeft plPatch() met versie ' + P.VERSIE + ' en de schakelaar');
  eis(/private static volatile boolean PATCH_AAN = true;/.test(s), 'de patch staat standaard aan, en alleen in het geheugen');
}
{
  // Een plugin-update verschuift een anker. Dan moet het script hardop falen,
  // met de naam van het anker erbij.
  const verschoven = ORIG[P.SERVICE].replace('            while (true) {\n', '            while ( true ) {\n');
  let fout = null;
  try { P.pas(verschoven, P.PATCHES[P.SERVICE]); } catch (e) { fout = e; }
  eis(fout && /leesdraad stopt/.test(fout.message), 'een verschoven anker stopt het script met zijn naam (' + (fout ? fout.message : 'geen fout') + ')');
  let crlf = null;
  try { P.pas(ORIG[P.SERVICE].replace(/\n/g, '\r\n'), P.PATCHES[P.SERVICE]); } catch (e) { crlf = e; }
  eis(crlf && /CRLF/.test(crlf.message), 'CRLF-regeleinden worden bij naam genoemd');
}
{
  // Het script als programma, zoals build-apk.yml het draait.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plspp-'));
  const d1 = path.join(tmp, 'android/src/main/java/com/bluetoothserial/plugin');
  fs.mkdirSync(d1, { recursive: true });
  fs.writeFileSync(path.join(tmp, P.SERVICE), ORIG[P.SERVICE]);
  fs.writeFileSync(path.join(tmp, P.PLUGIN), ORIG[P.PLUGIN]);
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"@ascentio-it/capacitor-bluetooth-serial","version":"8.0.1"}');
  const r1 = cp.spawnSync(process.execPath, [path.join(ROOT, 'plspppatch.js'), tmp], { encoding: 'utf8' });
  eis(r1.status === 0 && fs.readFileSync(path.join(tmp, P.SERVICE), 'utf8') === GEPATCHT[P.SERVICE], 'als programma: exit 0 en het bestand is gepatcht');
  fs.writeFileSync(path.join(tmp, P.SERVICE), ORIG[P.SERVICE].replace('connection.start();\n\n        connections.put', 'connection.start();\n        connections.put'));
  const r2 = cp.spawnSync(process.execPath, [path.join(ROOT, 'plspppatch.js'), tmp], { encoding: 'utf8' });
  eis(r2.status === 1 && /connect\(\): geen draad/.test(r2.stderr), 'als programma: exit 1 bij een anker dat niet past (' + r2.status + ')');
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('── 3. het gedrag, met javac ──');

/* Nagebouwde Android-klassen: net genoeg om de service te compileren en te
   draaien. De socket faalt op commando; lukt hij, dan blokkeert read() tot
   close() — zoals een echte BluetoothSocket. */
const STUBS = {
  'android/annotation/SuppressLint.java':
    'package android.annotation; public @interface SuppressLint { String[] value(); }',
  'android/util/Log.java':
    'package android.util; public class Log {' +
    ' public static int d(String t, String m){return 0;} public static int i(String t, String m){return 0;}' +
    ' public static int e(String t, String m){return 0;} public static int e(String t, String m, Throwable x){return 0;} }',
  'android/os/Build.java':
    'package android.os; public class Build { public static class VERSION { public static final int SDK_INT = 34; }' +
    ' public static class VERSION_CODES { public static final int N = 24; } }',
  'android/bluetooth/BluetoothAdapter.java':
    'package android.bluetooth; public class BluetoothAdapter { public boolean cancelDiscovery(){ return true; } }',
  'android/bluetooth/BluetoothDevice.java':
    'package android.bluetooth; public class BluetoothDevice { private final String a; public BluetoothDevice(String a){this.a=a;}' +
    ' public String getAddress(){ return a; }' +
    ' public BluetoothSocket createRfcommSocketToServiceRecord(java.util.UUID u){ return new BluetoothSocket(); }' +
    ' public BluetoothSocket createInsecureRfcommSocketToServiceRecord(java.util.UUID u){ return new BluetoothSocket(); } }',
  'android/bluetooth/BluetoothSocket.java':
    'package android.bluetooth; import java.io.*;' +
    ' public class BluetoothSocket { public static volatile boolean faal = false;' +
    ' private volatile boolean open = false, dicht = false; private final Object slot = new Object();' +
    ' public void connect() throws IOException { if (faal) throw new IOException("read failed, socket might closed"); open = true; }' +
    ' public boolean isConnected(){ return open && !dicht; }' +
    ' public void close() throws IOException { synchronized(slot){ dicht = true; slot.notifyAll(); } }' +
    ' public InputStream getInputStream() throws IOException { return new InputStream(){' +
    '   public int read() throws IOException { throw new IOException("niet gebruikt"); }' +
    '   public int read(byte[] b) throws IOException { synchronized(slot){ while(!dicht){ try{ slot.wait(); }catch(InterruptedException e){ throw new IOException("onderbroken"); } } } throw new IOException("socket closed"); } }; }' +
    ' public OutputStream getOutputStream() throws IOException { return new ByteArrayOutputStream(); } }',
  'com/bluetoothserial/plugin/BluetoothSerialPlugin.java':
    'package com.bluetoothserial.plugin; public class BluetoothSerialPlugin { public void connected(){} public void connectionFailed(){} }',
  'Proef.java':
    'import android.bluetooth.*; import com.bluetoothserial.BluetoothSerialService; import com.bluetoothserial.plugin.BluetoothSerialPlugin;' +
    ' public class Proef {' +
    '  static int[] tel(){ int levend=0, draait=0; for (java.util.Map.Entry<Thread,StackTraceElement[]> e : Thread.getAllStackTraces().entrySet()) {' +
    '    boolean lees=false; for (StackTraceElement s : e.getValue()) if (s.getClassName().endsWith("$BluetoothConnection") && s.getMethodName().equals("run")) lees=true;' +
    '    if (!lees) continue; levend++;' +
    '    StackTraceElement[] st = e.getValue(); boolean wacht=false; for (StackTraceElement s : st) if (s.getMethodName().equals("wait")) wacht=true;' +
    '    if (e.getKey().getState()==Thread.State.RUNNABLE && !wacht) draait++; } return new int[]{levend, draait}; }' +
    '  public static void main(String[] a) throws Exception {' +
    '   BluetoothSerialPlugin p = new BluetoothSerialPlugin(); BluetoothSerialService s = new BluetoothSerialService(p, new BluetoothAdapter());' +
    '   BluetoothDevice d = new BluetoothDevice("00:04:3E:8B:7B:32");' +
    '   BluetoothSocket.faal = true; s.connect(d, p); Thread.sleep(300); int[] t = tel(); System.out.println("mislukt " + t[0] + " " + t[1]);' +
    '   try { System.out.println("lijst " + BluetoothSerialService.class.getMethod("verbindingen").invoke(s) + " 0"); } catch (NoSuchMethodException e) { }' +
    '   BluetoothSocket.faal = true; s.connect(d, p); Thread.sleep(300); t = tel(); System.out.println("tweemaal " + t[0] + " " + t[1]);' +
    '   BluetoothSocket.faal = false; s.connect(d, p); Thread.sleep(300); t = tel(); System.out.println("verbonden " + t[0] + " " + t[1]);' +
    '   s.connect(d, p); Thread.sleep(300); t = tel(); System.out.println("opnieuw " + t[0] + " " + t[1]);' +
    '   s.disconnect(d.getAddress()); Thread.sleep(300); t = tel(); System.out.println("verbroken " + t[0] + " " + t[1]);' +
    '   java.lang.reflect.Method z = null; try { z = BluetoothSerialService.class.getMethod("zetPatch", boolean.class); } catch (NoSuchMethodException e) { }' +
    '   if (z != null) {' +
    '    z.invoke(null, false); BluetoothSocket.faal = true; s.connect(d, p); Thread.sleep(300); t = tel(); System.out.println("schakelaarUit " + t[0] + " " + t[1]);' +
    '    z.invoke(null, true); s.connect(d, p); Thread.sleep(300); t = tel(); System.out.println("schakelaarAan " + t[0] + " " + t[1]); }' +
    '   System.exit(0); } }'
};

function draai(serviceBron) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plsppj-'));
  const src = path.join(tmp, 'src'), uit = path.join(tmp, 'uit');
  const bestanden = [];
  for (const rel of Object.keys(STUBS)) {
    const f = path.join(src, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, STUBS[rel]);
    bestanden.push(f);
  }
  const svc = path.join(src, 'com/bluetoothserial/BluetoothSerialService.java');
  fs.writeFileSync(svc, serviceBron);
  bestanden.push(svc);
  fs.mkdirSync(uit);
  const c = cp.spawnSync('javac', ['-nowarn', '-d', uit].concat(bestanden), { encoding: 'utf8' });
  if (c.status !== 0) { fs.rmSync(tmp, { recursive: true, force: true }); return { fout: 'javac: ' + (c.stderr || c.error || '').toString().slice(0, 400) }; }
  const r = cp.spawnSync('java', ['-cp', uit, 'Proef'], { encoding: 'utf8', timeout: 20000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) return { fout: 'java: ' + (r.stderr || r.error || '').toString().slice(0, 400) };
  const o = {};
  r.stdout.trim().split('\n').forEach(function (l) { const d = l.split(' '); o[d[0]] = { levend: +d[1], draait: +d[2] }; });
  return o;
}

const javac = cp.spawnSync('javac', ['-version'], { encoding: 'utf8' });
if (javac.error || javac.status !== 0) {
  letop('geen javac op dit toestel — het gedrag is niet gemeten, alleen de ankers');
} else {
  const oud = draai(ORIG[P.SERVICE]);
  if (oud.fout) eis(false, 'het origineel compileert en draait met de nagebouwde klassen — ' + oud.fout);
  else {
    // De tegenproef: zonder patch hoort de fout er te zijn. Staat hij er niet,
    // dan bouwt de nagebouwde socket de fout niet na en zegt deel 2 niets.
    eis(oud.mislukt.draait === 1, 'TEGENPROEF origineel: één mislukte poging laat een draaiende draad achter (' + oud.mislukt.draait + ')');
    eis(oud.tweemaal.draait === 2, 'TEGENPROEF origineel: twee mislukte pogingen, twee draaiende draden (' + oud.tweemaal.draait + ')');
    eis(oud.verbroken.draait === 2, 'TEGENPROEF origineel: ook na disconnect() blijven ze draaien (' + oud.verbroken.draait + ')');
  }
  const nieuw = draai(GEPATCHT[P.SERVICE] || '');
  if (nieuw.fout) eis(false, 'de gepatchte service compileert en draait — ' + nieuw.fout);
  else {
    eis(nieuw.mislukt.levend === 0, 'gepatcht: een mislukte poging laat geen draad achter (' + nieuw.mislukt.levend + ')');
    // Het tweede slot: ook als de lus zelf al stopt, hoort een mislukte poging
    // niet als verbinding in de lijst te staan (dan vervangt hij de goede).
    eis(nieuw.lijst && nieuw.lijst.levend === 0, 'gepatcht: een mislukte poging komt niet in de lijst van verbindingen (' + (nieuw.lijst && nieuw.lijst.levend) + ')');
    eis(nieuw.tweemaal.levend === 0, 'gepatcht: twee mislukte pogingen ook niet (' + nieuw.tweemaal.levend + ')');
    eis(nieuw.verbonden.levend === 1 && nieuw.verbonden.draait === 0, 'gepatcht: verbonden is één draad, en die wacht in read() (' + nieuw.verbonden.levend + '/' + nieuw.verbonden.draait + ')');
    eis(nieuw.opnieuw.levend === 1, 'gepatcht: opnieuw verbinden op hetzelfde adres sluit de oude draad (' + nieuw.opnieuw.levend + ')');
    eis(nieuw.verbroken.levend === 0, 'gepatcht: na disconnect() is er geen draad meer (' + nieuw.verbroken.levend + ')');
    // De schakelaar voor de proef op de telefoon: uit hoort het oude gedrag
    // terug te geven — anders meet de knop "patch uit" niets.
    eis(nieuw.schakelaarUit && nieuw.schakelaarUit.draait === 1, 'gepatcht, schakelaar uit: de mislukte poging laat weer een draaiende draad achter (' + (nieuw.schakelaarUit && nieuw.schakelaarUit.draait) + ')');
    eis(nieuw.schakelaarAan && nieuw.schakelaarAan.draait === 1, 'schakelaar weer aan: er komt geen draad bij, de oude blijft tot de herstart (' + (nieuw.schakelaarAan && nieuw.schakelaarAan.draait) + ')');
  }
}

if (fouten) { console.log('FOUT — ' + fouten + ' eis(en) niet gehaald'); process.exit(1); }
console.log('Alles goed — de SPP-patch laat geen draaiende draden achter');
