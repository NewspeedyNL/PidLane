// ═══════════════════════════════════════════════════════════════════
// pidlane-checkopmaak.js — PLCheck: één opmaak voor de checkpagina's (19-11-2026)
// ───────────────────────────────────────────────────────────────────
// Airco/Wintercheck, Onderhoud, Klaar voor vertrek en Accu & elektrisch
// waren elk met de hand opgemaakt: een eigen accentkleur (cyaan, groen, blauw,
// paars), een emoji van 40 px als kop, knoppen in vier stijlen. Dezelfde app,
// vier huisstijlen. Hier staan de bouwstenen één keer; de CSS hoort bij
// .plc-ov in pidlane.css. Puur: tekst in, HTML uit (op ov() na, die het
// venster zijn klasse geeft). Geen bus-I/O. Laadt vóór pidlane-koopcheck.js.
// Test: test-checkopmaak.js
// ═══════════════════════════════════════════════════════════════════
(function(){
'use strict';
function esc(s){ return String(s===null || s===undefined ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* Het venster zelf: één klasse in plaats van een eigen verloop per check. */
function ov(el){
  if(!el) return el;
  el.className='plc-ov';
  el.style.cssText='';
  return el;
}
/* De kop: icoon in een ring, titel, één zin uitleg, en ✕ rechtsboven.
   sluit = de onclick-tekst van het kruisje. tekst mag HTML zijn (eigen invoer
   gaat er dus ge-escaped in bij de aanroeper). */
function kop(o){
  return '<div class="plc-balk"><span></span>'+
    '<button type="button" class="plc-x" onclick="'+esc(o.sluit)+'" aria-label="Sluiten">✕</button></div>'+
    '<div class="plc-kop"><span class="plc-ring" aria-hidden="true">'+esc(o.icoon)+'</span>'+
    '<h2>'+esc(o.titel)+'</h2>'+(o.tekst ? '<p>'+o.tekst+'</p>' : '')+'</div>';
}
function kaart(html, extra){ return '<div class="plc-kaart'+(extra ? ' '+esc(extra) : '')+'">'+html+'</div>'; }
/* Een tip of waarschuwing in één regel stijl: soort 'info' of 'let'. */
function tip(html, soort){
  return '<div class="plc-tip" data-soort="'+(soort==='let' ? 'let' : 'info')+'"><span aria-hidden="true">'+(soort==='let' ? '⚠️' : '💡')+'</span><div>'+html+'</div></div>';
}
/* Eén primaire knop per pagina, de rest secundair. */
function knop(label, onclick, soort){
  return '<button type="button" class="plc-knop '+(soort==='sec' ? 'sec' : 'pri')+'" onclick="'+esc(onclick)+'">'+esc(label)+'</button>';
}
function stappen(lijst){
  return kaart(lijst.map(function(s, i){
    return '<div class="plc-stap"><span class="plc-nr">'+(i+1)+'</span><div><b>'+esc(s[0])+'</b><small>'+esc(s[1])+'</small></div></div>';
  }).join(''));
}
/* Een veld met een label erboven. invoer = de HTML van het veld zelf. */
function veld(label, invoer){ return '<label class="plc-veld"><span>'+esc(label)+'</span>'+invoer+'</label>'; }
/* Keuzeknoppen naast elkaar; de gekozen krijgt .aan. lijst = [[waarde, label]]. */
function keus(naam, lijst, gekozen, onclick){
  return '<div class="plc-keus" role="radiogroup">'+lijst.map(function(x){
    return '<button type="button" class="plc-keus-knop'+(x[0]===gekozen ? ' aan' : '')+'" data-keus="'+esc(naam)+'" data-r="'+esc(x[0])+'"'+
      ' role="radio" aria-checked="'+(x[0]===gekozen)+'" onclick="'+esc(onclick.replace('$', x[0]))+'">'+esc(x[1])+'</button>';
  }).join('')+'</div>';
}
/* De keuze wisselen zonder de pagina opnieuw te tekenen. */
function zetKeus(naam, waarde){
  if(typeof document==='undefined') return;
  document.querySelectorAll('.plc-keus-knop[data-keus="'+naam+'"]').forEach(function(b){
    const aan=b.getAttribute('data-r')===waarde;
    b.classList.toggle('aan', aan); b.setAttribute('aria-checked', String(aan));
  });
}
function pagina(binnen){ return '<div class="plc-wrap">'+binnen+'</div>'; }

window.PLCheck = { esc:esc, ov:ov, kop:kop, kaart:kaart, tip:tip, knop:knop, stappen:stappen, veld:veld, keus:keus, zetKeus:zetKeus, pagina:pagina };
})();
