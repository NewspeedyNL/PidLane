// ══════════════════════════════════════════════════════════════════
// test-pldraden.js — PLDraden telt draaiende draden per draad, niet per naam
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Op 30-09-2026 om 12:31 meldde de snelheidsproef "5 draaiende draad" direct
// na een herstart. Twee dingen bleken mis:
//
//   1. De telling. PLDraden telde de processortijd per draadNAAM op, en met
//      de patch van #352 heten alle leesdraden "PLSpp-lees". Eén draad die
//      ronddraaide maakte daardoor álle leesdraden "draaiend".
//   2. De herstart was er geen. De app was weggeveegd terwijl de meetdienst
//      het proces in leven hield; alleen de pagina was nieuw. PLDraden geeft
//      daarom nu het proces-ID (pid + starttijd) mee, en kan het proces
//      beëindigen.
//
// Deze test compileert de echte native/PLDradenPlugin.java met een paar
// nagemaakte klassen, start drie draden met dezelfde naam in een nagebouwde
// BluetoothConnection.run() — één die ronddraait, twee die wachten — en
// leest de meting. /proc/self/task bestaat op Linux net als op Android.
//
// Geen javac, of geen /proc (macOS)? Dan LET OP.
//
// Draaien vanuit public/:  node test-pldraden.js   (exit 0 = goed)
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

const BRON = fs.readFileSync(path.join(__dirname, '..', 'native', 'PLDradenPlugin.java'), 'utf8');

const STUBS = {
  'android/system/Os.java': 'package android.system; public class Os { public static long sysconf(int n){ return 100; } }',
  'android/system/OsConstants.java': 'package android.system; public class OsConstants { public static final int _SC_CLK_TCK = 2; }',
  'android/os/Process.java': 'package android.os; public class Process { public static int myPid(){ return 4242; }' +
    ' public static long getStartElapsedRealtime(){ return 123456L; } public static void killProcess(int p){ System.out.println("KILL " + p); } }',
  'android/util/Log.java': 'package android.util; public class Log { public static int d(String a,String b){return 0;}' +
    ' public static int i(String a,String b){return 0;} public static int w(String a,String b,Throwable t){return 0;}' +
    ' public static int e(String a,String b,Throwable t){return 0;} }',
  'com/getcapacitor/JSObject.java': 'package com.getcapacitor; public class JSObject extends java.util.LinkedHashMap<String,Object> {' +
    ' public JSObject put(String k, Object v){ super.put(k,v); return this; } public JSObject put(String k, long v){ super.put(k,v); return this; }' +
    ' public JSObject put(String k, int v){ super.put(k,v); return this; } public JSObject put(String k, boolean v){ super.put(k,v); return this; }' +
    ' public JSObject put(String k, String v){ super.put(k,v); return this; } }',
  'com/getcapacitor/JSArray.java': 'package com.getcapacitor; public class JSArray extends java.util.ArrayList<Object> {' +
    ' public JSArray put(Object o){ add(o); return this; } public int length(){ return size(); } }',
  'com/getcapacitor/Plugin.java': 'package com.getcapacitor; public class Plugin {}',
  'com/getcapacitor/PluginMethod.java': 'package com.getcapacitor; public @interface PluginMethod {}',
  'com/getcapacitor/annotation/CapacitorPlugin.java': 'package com.getcapacitor.annotation; public @interface CapacitorPlugin { String name(); }',
  'com/getcapacitor/PluginCall.java': 'package com.getcapacitor; public class PluginCall { public volatile Object uit;' +
    ' public Integer getInt(String k, Integer d){ return d; } public synchronized void resolve(JSObject o){ uit=o; notifyAll(); }' +
    ' public synchronized void resolve(){ uit="leeg"; notifyAll(); } public synchronized void reject(String m){ uit="REJECT "+m; notifyAll(); } }',
  'Proef.java':
    'import com.getcapacitor.*;' +
    ' public class Proef {' +
    '  static class BluetoothConnection extends Thread { final boolean rond; volatile int x;' +
    '   BluetoothConnection(boolean r){ super("PLSpp-lees"); rond=r; setDaemon(true); }' +
    '   public void run(){ if (rond) { for(;;){ x++; } } else { synchronized(this){ try { wait(); } catch (InterruptedException e) {} } } } }' +
    '  public static void main(String[] a) throws Exception {' +
    '   new BluetoothConnection(true).start(); new BluetoothConnection(false).start(); new BluetoothConnection(false).start();' +
    '   Thread.sleep(200);' +
    '   PluginCall c = new PluginCall(); new nl.pidlane.app.PLDradenPlugin().meet(c);' +
    '   synchronized (c) { while (c.uit == null) c.wait(); }' +
    '   JSObject r = (JSObject) c.uit;' +
    '   System.out.println("levend " + r.get("sppLevend")); System.out.println("draait " + r.get("sppDraait"));' +
    '   System.out.println("pid " + r.get("pid")); System.out.println("start " + r.get("procesStart"));' +
    '   PluginCall k = new PluginCall(); new nl.pidlane.app.PLDradenPlugin().beeindig(k);' +
    '   synchronized (k) { while (k.uit == null) k.wait(); } System.out.println("antwoord " + k.uit);' +
    '   Thread.sleep(600); System.exit(0); } }'
};

const javac = cp.spawnSync('javac', ['-version'], { encoding: 'utf8' });
if (javac.error || javac.status !== 0) {
  letop('geen javac op dit toestel — PLDraden is niet gemeten');
} else if (!fs.existsSync('/proc/self/task')) {
  letop('geen /proc/self/task op dit toestel — PLDraden meet daar niets');
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pldraden-'));
  const src = path.join(tmp, 'src'), uit = path.join(tmp, 'uit');
  const bestanden = [];
  Object.keys(STUBS).forEach(function (rel) {
    const f = path.join(src, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, STUBS[rel]);
    bestanden.push(f);
  });
  const doel = path.join(src, 'nl/pidlane/app/PLDradenPlugin.java');
  fs.mkdirSync(path.dirname(doel), { recursive: true });
  fs.writeFileSync(doel, BRON);
  bestanden.push(doel);
  fs.mkdirSync(uit);
  const c = cp.spawnSync('javac', ['-nowarn', '-d', uit].concat(bestanden), { encoding: 'utf8' });
  eis(c.status === 0, 'native/PLDradenPlugin.java compileert' + (c.status === 0 ? '' : ' — ' + String(c.stderr).slice(0, 400)));
  if (c.status === 0) {
    const r = cp.spawnSync('java', ['-cp', uit, 'Proef'], { encoding: 'utf8', timeout: 20000 });
    const o = {};
    String(r.stdout || '').trim().split('\n').forEach(function (l) { const i = l.indexOf(' '); if (i > 0) o[l.slice(0, i)] = l.slice(i + 1); });
    eis(o.levend === '3', 'drie leesdraden gezien (' + o.levend + ')');
    // De kern, en de tegenproef zit erin: de oude telling per naam gaf hier 3.
    eis(o.draait === '1', 'precies één draait — niet alle drie die zo heten (' + o.draait + ')');
    eis(o.pid === '4242' && o.start === '123456', 'het proces-ID komt mee: pid en starttijd (' + o.pid + ' / ' + o.start + ')');
    eis(o.antwoord === 'leeg' && /KILL 4242/.test(r.stdout || ''), 'beeindig() antwoordt eerst en beëindigt dan het eigen proces');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (fouten) { console.log('FOUT — ' + fouten + ' eis(en) niet gehaald'); process.exit(1); }
console.log('Alles goed — PLDraden telt per draad en kent zijn proces');
