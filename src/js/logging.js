// ════════════════════════════════════════
// logging.js — Lokale log + Google Sheets
// ════════════════════════════════════════

window.localLog = [];

async function logToSheets(type, message, extra={}) {
  if(!window.SHEETS_LOG_URL) return;
  try {
    const v = window.vehicleInfo || {};
    fetch(window.SHEETS_LOG_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        timestamp:   new Date().toISOString(),
        type,
        message,
        merk:        v.merk  || '',
        year:        v.year  || '',
        vin:         v.vin   || '',
        protocol:    window.selectedNetwork?.name || '',
        activePIDs:  [...(window.activePIDs||[])].join(','),
        appVersion:  window.APP_VERSION || '2.0',
        ...extra
      })
    }).catch(()=>{});
  } catch(e) {}
}

function log(msg, type='') {
  const bar = document.getElementById('logbar');
  if (!bar) return;
  const ts = new Date().toTimeString().slice(0,8);
  const row = document.createElement('div');
  row.className = 'le';
  // Gebruik textContent voor veiligheid — geen innerHTML met user data
  const tsEl = document.createElement('span'); tsEl.className='lt2'; tsEl.textContent=ts;
  const msgEl = document.createElement('span'); msgEl.className=`lm ${type}`; msgEl.textContent=msg;
  row.appendChild(tsEl); row.appendChild(msgEl);
  bar.appendChild(row);
  bar.scrollTop = bar.scrollHeight;
  while(bar.children.length > 100) bar.removeChild(bar.firstChild);

  window.localLog.push({ts, type, msg});
  if(window.localLog.length > 500) window.localLog.shift();

  // Remote logging voor errors en outliers
  if(type === 'err')  logToSheets('error',   msg);
  if(type === 'warn' && (msg.includes('buiten')||msg.includes('sprong')||msg.includes('outlier')))
    logToSheets('outlier', msg);
}

function downloadLog() {
  const v = window.vehicleInfo || {};
  const lines = [
    `PidLane — Log`,
    `Datum: ${new Date().toLocaleString('nl')}`,
    `Voertuig: ${v.merk||'?'} ${v.year||''} ${v.vin||''}`,
    '',
    ...window.localLog.map(l => `[${l.ts}][${l.type||'info'}] ${l.msg}`)
  ];
  downloadFile('pidlane-log.txt', lines.join('\n'));
}

function downloadFile(name, content) {
  const blob = new Blob([content], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

// Exporteer functies globaal
window.log = log;
window.downloadLog = downloadLog;
window.downloadFile = downloadFile;
window.logToSheets = logToSheets;
