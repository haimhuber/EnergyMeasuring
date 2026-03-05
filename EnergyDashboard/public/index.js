// --- Add Breaker for Comparison Button ---
function addCompareBreakerButtonAfterReport() {
  // Remove if already exists
  const oldBtn = document.getElementById('add-breaker-compare-btn');
  if (oldBtn) oldBtn.remove();
  const card = document.getElementById('report-card');
  if (!card) return;
  const btn = document.createElement('button');
  btn.id = 'add-breaker-compare-btn';
  btn.className = 'btn-generate';
  btn.textContent = 'Add breaker for comparison';
  btn.style.background = '#1a7f37';
  btn.style.margin = '18px auto 0 auto';
  btn.style.display = 'block';
  btn.onclick = showSmallBreakerCompareModal;
  card.parentNode.insertBefore(btn, card.nextSibling);
}

// --- Small Modal for Breaker Selection ---
function showSmallBreakerCompareModal() {
  // Remove existing modal if present
  const oldModal = document.getElementById('breaker-modal');
  if (oldModal) oldModal.remove();
  const modal = document.createElement('div');
  modal.id = 'breaker-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.background = 'rgba(0,0,0,0.35)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '9999';
  // Small box
  const box = document.createElement('div');
  box.style.background = '#fff';
  box.style.padding = '18px 18px 14px 18px';
  box.style.borderRadius = '10px';
  box.style.boxShadow = '0 2px 16px rgba(0,0,0,0.13)';
  box.style.minWidth = '220px';
  box.style.maxWidth = '90vw';
  box.style.maxHeight = '60vh';
  box.style.overflowY = 'auto';
  const title = document.createElement('div');
  title.textContent = 'Select breaker for comparison';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  box.appendChild(title);
  // Breaker select
  const select = document.createElement('select');
  select.style.width = '100%';
  select.style.fontSize = '16px';
  select.style.marginBottom = '16px';
  const mainBreakerId = document.getElementById('sel-breaker').value;
  for (const id in BREAKERS) {
    if (id === mainBreakerId) continue;
    if (comparisonBreakers.includes(id)) continue;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = BREAKERS[id].name;
    select.appendChild(opt);
  }
  box.appendChild(select);
  // Buttons
  const okBtn = document.createElement('button');
  okBtn.textContent = 'Confirm';
  okBtn.className = 'btn-confirm';
  okBtn.style.marginLeft = '10px';
  okBtn.onclick = async function () {
    const selectedId = select.value;
    if (!selectedId) return;
    if (comparisonBreakers.length >= 2) {
      alert('You can compare up to 3 breakers total.');
      return;
    }
    comparisonBreakers.push(selectedId);
    await addComparisonBreakerToChart(selectedId);
    modal.remove();
    // Hide button if max reached
    if (comparisonBreakers.length >= 2) {
      const btn = document.getElementById('add-breaker-compare-btn');
      if (btn) btn.style.display = 'none';
    }
  };
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'btn-cancel';
  cancelBtn.onclick = function () { modal.remove(); };
  box.appendChild(okBtn);
  box.appendChild(cancelBtn);
  modal.appendChild(box);
  document.body.appendChild(modal);
}

// --- Comparison logic ---
let comparisonBreakers = [];
const comparisonColors = [
  'rgba(26, 127, 55, 0.85)', // green
  'rgba(0, 112, 192, 0.85)', // blue
  'rgba(255, 140, 0, 0.85)'  // orange
];

// Patch addCompareBreakerButtonAfterReport to reset comparison state
const _origAddCompareBreakerButtonAfterReport = addCompareBreakerButtonAfterReport;
addCompareBreakerButtonAfterReport = function () {
  comparisonBreakers = [];
  _origAddCompareBreakerButtonAfterReport();
};

// Patch showSmallBreakerCompareModal to filter out already compared breakers
const _origShowSmallBreakerCompareModal = showSmallBreakerCompareModal;
showSmallBreakerCompareModal = function () {
  // Remove existing modal if present
  const oldModal = document.getElementById('breaker-modal');
  if (oldModal) oldModal.remove();
  const modal = document.createElement('div');
  modal.id = 'breaker-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.background = 'rgba(0,0,0,0.35)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '9999';
  // Small box
  const box = document.createElement('div');
  box.style.background = '#fff';
  box.style.padding = '18px 18px 14px 18px';
  box.style.borderRadius = '10px';
  box.style.boxShadow = '0 2px 16px rgba(0,0,0,0.13)';
  box.style.minWidth = '220px';
  box.style.maxWidth = '90vw';
  box.style.maxHeight = '60vh';
  box.style.overflowY = 'auto';
  const title = document.createElement('div');
  title.textContent = 'Select breaker for comparison';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  box.appendChild(title);
  // Breaker select
  const select = document.createElement('select');
  select.style.width = '100%';
  select.style.fontSize = '16px';
  select.style.marginBottom = '16px';
  const mainBreakerId = document.getElementById('sel-breaker').value;
  for (const id in BREAKERS) {
    if (id === mainBreakerId) continue;
    if (comparisonBreakers.includes(id)) continue;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = BREAKERS[id].name;
    select.appendChild(opt);
  }
  box.appendChild(select);
  // Buttons
  const okBtn = document.createElement('button');
  okBtn.textContent = 'Confirm';
  okBtn.className = 'btn-confirm';
  okBtn.style.marginLeft = '10px';
  okBtn.onclick = async function () {
    const selectedId = select.value;
    if (!selectedId) return;
    if (comparisonBreakers.length >= 2) {
      alert('You can compare up to 3 breakers total.');
      return;
    }
    comparisonBreakers.push(selectedId);
    await addComparisonBreakerToChart(selectedId);
    modal.remove();
    // Hide button if max reached
    if (comparisonBreakers.length >= 2) {
      const btn = document.getElementById('add-breaker-compare-btn');
      if (btn) btn.style.display = 'none';
    }
  };
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'btn-cancel';
  cancelBtn.onclick = function () { modal.remove(); };
  box.appendChild(okBtn);
  box.appendChild(cancelBtn);
  modal.appendChild(box);
  document.body.appendChild(modal);
};

// Add a comparison breaker to the chart (same period/view)
async function addComparisonBreakerToChart(breakerId) {
  const from = document.getElementById('sel-from').value;
  const to = document.getElementById('sel-to').value;
  const view = document.querySelector('input[name="view"]:checked').value;
  // Fetch data
  let d;
  try {
    d = await fetchConsumption(breakerId, from, to, view);
  } catch (e) {
    alert('Failed to fetch data for comparison breaker.');
    return;
  }
  let rows = Array.isArray(d.rows) ? d.rows : [];
  rows = sortByTimestampAsc(rows);
  // Build data series matching the main chart's labels
  const mainLabels = chartInstance.data.labels;
  let dataArr = [];
  if (view === 'monthly') {
    const map = Object.fromEntries(rows.map(r => [shortMonth(r.timestamp), Number(r.kwh || 0)]));
    dataArr = mainLabels.map(lab => map[lab] ?? 0);
  } else if (view === 'daily') {
    const map = Object.fromEntries(rows.map(r => [shortDay(r.timestamp), Number(r.kwh || 0)]));
    dataArr = mainLabels.map(lab => map[lab] ?? 0);
  } else {
    // hourly
    const map = Object.fromEntries(rows.map(r => [hhFromStamp(r.timestamp), Number(r.kwh || 0)]));
    dataArr = mainLabels.map(lab => map[lab] ?? 0);
  }
  // Add dataset to chart
  const colorIdx = comparisonBreakers.length - 1;
  chartInstance.data.datasets.push({
    label: BREAKERS[breakerId]?.name || ('Breaker ' + breakerId),
    data: dataArr,
    backgroundColor: comparisonColors[colorIdx % comparisonColors.length],
    borderRadius: 2,
    borderSkipped: false
  });
  chartInstance.update();
}

// Patch generateReport to reset comparisonBreakers
const _origGenerateReport = generateReport;
generateReport = async function () {
  comparisonBreakers = [];
  await _origGenerateReport.apply(this, arguments);
};

function currentUsername() {
  const username = document.querySelector('.nav-user span');
  const storedName = localStorage.getItem('Username');
  if (username && storedName) {
    username.textContent = storedName;
  }
}
currentUsername();


const API_BASE = "";

/**
 * ✅ BREAKERS is a real object (not a Promise)
 * Format we keep everywhere:
 * BREAKERS["1"] = { id:"1", name:"..." }
 */
let BREAKERS = {};

let chartInstance = null;

function setStatus(type, text) {
  document.getElementById('status-dot').className = 'status-dot' + (type ? ' ' + type : '');
  document.getElementById('status-text').textContent = text;
}

function fmtMoney(n) { return Number(n || 0).toFixed(2); }
function fmtRate(n) {
  if (n === "-" || n == null) return "-";
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toFixed(4);
}
function fmtKwh(n) {
  const x = Number(n || 0);
  return Number.isInteger(x) ? String(x) : x.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
function seasonLabel(s) {
  if (s === "winter") return "Winter";
  if (s === "summer") return "Summer";
  if (s === "shoulder") return "Transition";
  return s || "-";
}


function gbStamp(iso) {
  if (!iso) return "";
  const s = String(iso);
  if (!s.includes(" ")) return s;
  const [d, t] = s.split(" ");
  const [Y, M, D] = d.split("-");
  return `${D}/${M} ${t}`;
}
function gbDate(isoDate) {
  const s = String(isoDate || "");
  // monthly stamp (YYYY-MM)
  if (/^\d{4}-\d{2}$/.test(s)) return gbMonth(s);
  const [Y, M, D] = s.split("-");
  return `${D}/${M}/${Y}`;
}
function shortDay(isoDate) {
  const [Y, M, D] = String(isoDate).split("-");
  return `${D}/${M}`;
}
function hhFromStamp(stamp) {
  const s = String(stamp || "");
  if (s.includes(" ")) return s.split(" ")[1];
  return s;
}

/* Format YYYY-MM into a short month label (e.g. Mar 2025) */
function gbMonth(ym) {
  const s = String(ym || "");
  const mnames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = s.split('-');
  if (parts.length < 2) return s;
  const Y = parts[0];
  const M = Number(parts[1]);
  if (!M || M < 1 || M > 12) return s;
  return `${mnames[M - 1]} ${Y}`;
}

function shortMonth(ym) { return gbMonth(ym); }

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function ensureChart() {
  if (window.Chart) return;
  await loadScript("/vendor/chart.umd.min.js");
  if (!window.Chart) throw new Error("Chart.js failed to load (CDN + local fallback)");
}

function sortByTimestampAsc(rows) {
  return [...rows].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

/* ✅ Print only the "records" list (no table) */
function printRecordsOnly() {
  const pr = document.getElementById("print-records");
  pr.style.display = "block";
  window.print();
  pr.style.display = "none";
}

/* ✅ If user selected hourly - aggregate to DAILY for PDF list */
function aggregateHourlyToDaily(rows) {
  const map = new Map(); // date -> {timestamp, peak_kwh, off_kwh, kwh, amount}
  rows.forEach(r => {
    const ts = String(r.timestamp || "");
    const date = ts.includes(" ") ? ts.split(" ")[0] : ts.slice(0, 10);
    if (!date) return;

    const type = r.type || "Off-Peak";
    const pk = (type === "Peak");

    const kwh = Number(r.kwh || 0);
    const amount = Number(r.amount || 0);

    if (!map.has(date)) {
      map.set(date, { timestamp: date, peak_kwh: 0, off_kwh: 0, kwh: 0, amount: 0 });
    }
    const agg = map.get(date);
    agg.kwh += kwh;
    agg.amount += amount;
    if (pk) agg.peak_kwh += kwh;
    else agg.off_kwh += kwh;
  });

  return [...map.values()].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

// Get user role from API and adjust UI accordingly (e.g. hide multi-breaker report for non-admins)
async function adjustUIForUserRole() {
  const userRole = await fetch(`${API_BASE}/api/me`);
  const userData = await userRole.json();
  return userData?.user?.role;
}


/* Fetch consumption JSON helper */
async function fetchConsumption(breakerId, from, to, view) {
  const url = `${API_BASE}/api/consumption?breaker_id=${breakerId}&from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}&view=${encodeURIComponent(view)}`;
  const resp = await fetch(url, { cache: 'no-store', credentials: 'include' });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    window.alert(`API error (${resp.status}): ${t || resp.statusText}`);
    throw new Error(`API error (${resp.status}): ${t || resp.statusText}`);
  }
  return await resp.json();
}

// Fetch last raw parsed CSV rows for a breaker (debug helper)
async function getLastSamples(breakerId, limit = 10) {
  const url = `${API_BASE}/api/debug-rows?breaker_id=${breakerId}&limit=${limit}`;
  const resp = await fetch(url, { cache: 'no-store', credentials: 'include' });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Debug API error (${resp.status}): ${t || resp.statusText}`);
  }
  return await resp.json();
}

// Render last samples into the no-data panel for quick debugging
async function showLastSamplesInNoData(breakerId, limit = 10) {
  const noData = document.getElementById('no-data');
  // remove previous debug area if exists
  const prev = document.getElementById('no-data-debug');
  if (prev) prev.remove();

  const dbg = document.createElement('div');
  dbg.id = 'no-data-debug';
  dbg.style.marginTop = '12px';

  const btn = document.createElement('button');
  btn.className = 'btn-generate';
  btn.style.visibility = 'hidden'; // hide by default, will be shown if API call succeeds
  btn.style.background = '#af3d3d';
  btn.style.padding = '8px 12px';
  btn.textContent = `Show last ${limit} samples`;
  dbg.appendChild(btn);


  const pre = document.createElement('pre');
  pre.id = 'no-data-debug-pre';
  pre.style.display = 'none';
  pre.style.marginTop = '10px';
  pre.style.padding = '10px';
  pre.style.maxHeight = '320px';
  pre.style.overflow = 'auto';
  pre.style.background = '#111';
  pre.style.color = '#fff';
  pre.style.borderRadius = '6px';
  dbg.appendChild(pre);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Loading...';
    try {
      const json = await getLastSamples(breakerId, limit);
      pre.textContent = JSON.stringify(json, null, 2);
      pre.style.display = 'block';
      btn.textContent = 'Refresh samples';
    } catch (err) {
      pre.textContent = `Error: ${err.message || err}`;
      pre.style.display = 'block';
      btn.textContent = original;
    } finally {
      btn.disabled = false;
    }
  });

  noData.appendChild(dbg);
}

/* Render a table body string for rows (hourly or daily) */
function buildTableRowsHtml(rows, view) {
  let tableRows = "";

  if (view === 'monthly') {
    // monthly summaries already grouped server-side
    rows.forEach(r => {
      const dPk = Number(r.peak_kwh || 0);
      const dOff = Number(r.off_kwh || 0);
      const dTot = Number(r.kwh || 0);
      const dAmt = Number(r.amount || 0);

      tableRows += `<tr>
        <td>${gbMonth(r.timestamp)}</td>
        <td>
          <span class="tag pk" style="margin-right:3px">Pk: ${fmtKwh(dPk)}</span>
          <span class="tag op">Off: ${fmtKwh(dOff)}</span>
        </td>
        <td class="n">${fmtKwh(dTot)}</td>
        <td class="n">Monthly</td>
        <td class="n">${fmtMoney(dAmt)}</td>
      </tr>`;
    });
    return tableRows;
  }

  if (view === 'daily') {
    rows.forEach(r => {
      const dPk = Number(r.peak_kwh || 0);
      const dOff = Number(r.off_kwh || 0);
      const dTot = Number(r.kwh || 0);
      const dAmt = Number(r.amount || 0);

      tableRows += `<tr>
        <td>${gbDate(r.timestamp)}</td>
        <td>
          <span class="tag pk" style="margin-right:3px">Pk: ${fmtKwh(dPk)}</span>
          <span class="tag op">Off: ${fmtKwh(dOff)}</span>
        </td>
        <td class="n">${fmtKwh(dTot)}</td>
        <td class="n">Mixed</td>
        <td class="n">${fmtMoney(dAmt)}</td>
      </tr>`;
    });
    return tableRows;
  }

  // default: hourly
  rows.forEach(r => {
    const type = r.type || "Off-Peak";
    const pk = (type === "Peak");
    const kwh = Number(r.kwh || 0);

    tableRows += `<tr class="${pk ? 'pk-row' : ''}">
      <td>${gbStamp(r.timestamp)}</td>
      <td><span class="tag ${pk ? 'pk' : 'op'}">${pk ? 'Peak' : 'Off-Peak'}</span></td>
      <td class="n">${fmtKwh(kwh)}</td>
      <td class="n">${fmtRate(r.rate)}</td>
      <td class="n">${fmtMoney(r.amount)}</td>
    </tr>`;
  });

  return tableRows;
}


// --- Modal for multi-breaker selection ---
function showBreakerSelectionModal(onConfirm) {
  // Remove existing modal if present
  const oldModal = document.getElementById('breaker-modal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'breaker-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.background = 'rgba(0,0,0,0.35)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '9999';

  const box = document.createElement('div');
  box.style.background = '#fff';
  box.style.padding = '32px 28px 24px 28px';
  box.style.borderRadius = '12px';
  box.style.boxShadow = '0 4px 32px rgba(0,0,0,0.18)';
  box.style.minWidth = '320px';
  box.style.maxWidth = '90vw';
  box.style.maxHeight = '80vh';
  box.style.overflowY = 'auto';

  const title = document.createElement('div');
  title.textContent = 'Select breakers for report';
  title.style.fontWeight = 'bold';
  title.style.fontSize = '20px';
  title.style.marginBottom = '18px';
  box.appendChild(title);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '10px';

  // BREAKERS is a map: { id: {id, name} }
  Object.values(BREAKERS).forEach(b => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '8px';
    label.style.cursor = 'pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = b.id;
    cb.checked = false;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(`${b.id} - ${b.name}`));
    list.appendChild(label);
  });
  box.appendChild(list);

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.justifyContent = 'flex-end';
  btnRow.style.gap = '12px';
  btnRow.style.marginTop = '24px';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'btn-cancel';
  cancelBtn.onclick = () => modal.remove();
  btnRow.appendChild(cancelBtn);

  const okBtn = document.createElement('button');
  okBtn.textContent = 'Confirm';
  okBtn.className = 'btn-confirm';
  okBtn.style.background = '#1a7f37';
  okBtn.style.color = '#fff';
  okBtn.style.fontWeight = 'bold';
  okBtn.onclick = () => {
    const checked = Array.from(list.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    if (checked.length === 0) {
      alert('Please select at least one breaker to generate the report.');
      return;
    }
    modal.remove();
    onConfirm(checked);
  };
  btnRow.appendChild(okBtn);

  box.appendChild(btnRow);
  modal.appendChild(box);
  document.body.appendChild(modal);
}

// Updated: Generate report for user-selected breakers
async function generateMultiBreakerReport() {
  showBreakerSelectionModal(async (ids) => {
    const checkCookie = await fetch(`${API_BASE}/api/me`);
    if (!checkCookie.ok) {
      window.alert("Session expired. Please log in again.");
      window.location.href = '/login.html';
      return;
    }
    const from = document.getElementById('sel-from').value;
    const to = document.getElementById('sel-to').value;
    const view = document.querySelector('input[name="view"]:checked').value;
    const clearSelectedData = document.getElementById("sel-breaker");
    clearSelectedData.value = "";
    if (!from || !to) { setStatus('', 'Please select a date range.'); return; }

    const card = document.getElementById('report-card');
    const placeholder = document.getElementById('placeholder');
    const noData = document.getElementById('no-data');

    placeholder.style.display = 'none';
    noData.classList.remove('visible');
    card.classList.remove('visible');
    card.innerHTML = "";

    document.getElementById("print-records").innerHTML = "";

    setStatus('loading', 'Fetching multi-breaker data...');

    try {
      const parts = [];
      const printParts = [];

      let totalAmount = 0;
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        const d = await fetchConsumption(id, from, to, view);
        const rows = Array.isArray(d.rows) ? sortByTimestampAsc(d.rows) : [];
        const breaker = BREAKERS[String(id)] || { id: String(id), name: `Breaker ${id}` };

        if (!rows.length) {
          parts.push(`<div style="padding:18px;border:1px solid #eee;margin-bottom:12px;">No data for ${breaker.name} (${id}) in selected period.</div>`);
          continue;
        }

        totalAmount += Number(d.total_amount || 0);

        const tableRows = buildTableRowsHtml(rows, view);

        const part = `
            <div style="border:1px solid #201f1f;border-radius:8px;margin-bottom:18px;overflow:hidden;background:#fff;">
              <div style="padding:12px 16px;border-bottom:1px solid #f2f2f2;display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:800">${breaker.name} — Breaker ID ${breaker.id}</div>
                <div style="font-family:DM Mono,monospace;font-size:12px;color:#666">Invoice: ${d.invoice_no || ''}</div>
              </div>
              <div>
              <div style="padding:12px 12px;">
                <div style="overflow:auto;">
                  <table class="rpt-table" style="width:100%;">
                    <thead><tr>
                      <th>${view === 'hourly' ? 'Time' : 'Date'}</th>
                      <th>Type</th><th>Total kWh</th><th>Rate</th><th>ILS</th>
                    </tr></thead>
                    <tbody>${tableRows}</tbody>
                  </table>
                </div>
              </div>
              <div style="padding:12px 12px; border-top:1px solid #f2f2f2; display:flex; justify-content:flex-end; gap:20px;">
        <div style="font-weight:700;">Total due: <span style="font-family:DM Mono,monospace;">${fmtMoney(d.total_amount || 0)} ILS</span></div>
        </div>
        <hr style="margin:30px 0; height:6px; border: solid; background:#e6e6e6;" />
          `;

        parts.push(part);

        // For print: a compact summary + rows as on single report
        const dailyRowsForPrint = (view === "daily" || view === "monthly") ? rows : aggregateHourlyToDaily(rows);
        let pdfRows = "";
        dailyRowsForPrint.forEach(r => {
          const dPk = Number(r.peak_kwh || 0);
          const dOff = Number(r.off_kwh || 0);
          const dTot = Number(r.kwh || 0);
          const dAmt = Number(r.amount || 0);
          pdfRows += `
              <div class="row">
                <div class="d">${gbDate(r.timestamp)}</div>
                <div class="cell"><div class="k">Peak</div><div class="v"><strong>${fmtKwh(dPk)}</strong> kWh</div></div>
                <div class="cell"><div class="k">Off-peak</div><div class="v"><strong>${fmtKwh(dOff)}</strong> kWh</div></div>
                <div class="cell"><div class="k">Total</div><div class="v"><strong>${fmtKwh(dTot)}</strong> kWh</div></div>
                <div class="cell"><div class="k">ILS</div><div class="v"><strong>${fmtMoney(dAmt)}</strong></div></div>
              </div>
            `;
        });

        const printPart = `
            <div class="pdf-page" style="margin-bottom:16px;">
              <div class="pdf-header">
                <div class="pdf-head-row">
                  <div class="pdf-title" style="text-align:left; width:100%; font-weight:700; font-size:18px; padding:0 0 8px 0;">${breaker.name} — ${from} → ${to}</div>
                </div>
                <div class="pdf-title"><div class="t1">Energy Monitoring System</div></div>
                <div class="pdf-chips"><div class="chip"><strong>Breaker:</strong> ${breaker.name}</div><div class="chip"><strong>ID:</strong> ${breaker.id}</div></div>
              </div>
              <div class="pdf-summary">
                <div class="sum-total"><div class="k">Total due</div><div class="v">${fmtMoney(d.total_amount || 0)} <span style="font-size:13px;font-weight:800;opacity:.75">ILS</span></div></div>
                <div class="sum-box pk"><div class="k">Peak summary</div><div class="v">${fmtKwh(d.peak_kwh || 0)} kWh</div><div class="s">${fmtMoney(d.peak_amount || 0)} ILS</div></div>
                <div class="sum-box op"><div class="k">Off-peak summary</div><div class="v">${fmtKwh(d.offpeak_kwh || 0)} kWh</div><div class="s">${fmtMoney(d.offpeak_amount || 0)} ILS</div></div>
              </div>
              <div class="pdf-section-title"><div class="l">${view === 'monthly' ? 'Monthly records' : 'Daily records'}</div><div class="r">${dailyRowsForPrint.length} ${view === 'monthly' ? 'months' : 'days'}</div></div>
              <div class="rowlist">${pdfRows}</div>
            </div>
          `;
        printParts.push(printPart);
      }

      // render combined UI
      card.innerHTML = `
        ${parts.join('\n')}
        <div style="display:flex;justify-content:flex-end;margin:24px 0 0 0;">
          <button class="btn-print" onclick="printRecordsOnly()">Print records</button>
        </div>
        <div style="font-size:1.2em;font-weight:700;margin:24px 0 0 0;text-align:left;">Total for all breakers: <span style="font-family:DM Mono,monospace;">${fmtMoney(totalAmount)} ILS</span></div>
      `;
      card.classList.add('visible');

      // fill print container with stacked pages
      document.getElementById('print-records').innerHTML = `<div>${printParts.join('\n')}</div>`;

      setStatus('active', 'Multi-breaker report ready');

    } catch (err) {
      console.error('Multi breaker error', err);
      setStatus('', `Error: ${err.message || err}`);
      document.getElementById('no-data').classList.add('visible');
    }
  });
}

/** ✅ Load breakers from API and fill the select */
async function loadBreakersAndFillSelect() {
  const select = document.getElementById("sel-breaker");

  try {
    setStatus("loading", "Loading breakers...");

    const res = await fetch(`${API_BASE}/api/breakers`, { cache: "no-store", credentials: 'include' });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Breakers API error (${res.status}): ${t || res.statusText}`);
    }

    const data = await res.json();


    // ✅ data is ARRAY: [{id,name},...]
    const list = Array.isArray(data) ? data : (data.breakers || []);

    // ✅ Build BREAKERS as object map: BREAKERS["1"] = {id:"1", name:"..."}
    BREAKERS = Object.fromEntries(
      list
        .filter(b => b && b.id != null)
        .map(b => {
          const id = String(b.id).trim();
          const name = String(b.name || `Breaker ${id}`).trim();
          return [id, { id, name }];
        })
    );

    // ✅ clear existing options (keep placeholder)
    select.length = 1;
    try {
      if (await adjustUIForUserRole() === "admin") {
        Object.entries(BREAKERS)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .forEach(([key, breaker]) => {
            const option = document.createElement("option");
            option.value = key; // value = breakerId
            option.textContent = `${key} - ${breaker.name}`;
            select.appendChild(option);
          });

        setStatus("", "Ready.");
      } else {
        const option = document.createElement("option");
        option.value = BREAKERS[5].id; // value = breakerId
        option.textContent = `${BREAKERS[5].id} - ${BREAKERS[5].name}`;
        select.appendChild(option);
        // Hide Generate total cost
        document.querySelector('.btn-generate-total-cost').style.visibility = 'hidden';
        setStatus("", "Ready. (Guest view: breakers list are limited for report generation)");
      }
      // if not admin, hide the multi-breaker report option
    } catch (e) {
      // if API call fails (e.g. session expired), still fill the breakers from localStorage or empty object
      console.warn('Failed to verify session while loading breakers, filling from localStorage if available', e);
    }


  } catch (err) {
    console.error("Failed to load breakers:", err);
    BREAKERS = {};
    select.length = 1;
    setStatus("", `Failed to load breakers: ${err.message || err}`);
  }
}

async function generateReport() {
  const breakerId = parseInt(document.getElementById('sel-breaker').value, 10);
  const from = document.getElementById('sel-from').value;
  const to = document.getElementById('sel-to').value;
  const view = document.querySelector('input[name="view"]:checked').value;

  const placeholder = document.getElementById('placeholder');
  const noData = document.getElementById('no-data');
  const card = document.getElementById('report-card');

  if (!breakerId) {
    setStatus('', 'Please select a breaker.');
    window.alert('Please select a breaker before generating the report.');
    return;
  }
  if (!from || !to) {
    setStatus('', 'Please select a date range.');
    window.alert('Please select a date range before generating the report.');
    return;
  }
  if (from > to) {
    setStatus('', 'Invalid date range: "From" date is after "To" date.');
    window.alert('Invalid date range: "From" date is after "To" date. Please correct the dates and try again.');
    return;
  }
  placeholder.style.display = 'none';
  noData.classList.remove('visible');
  card.classList.remove('visible');
  card.innerHTML = "";
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  // clear print container
  document.getElementById("print-records").innerHTML = "";

  setStatus('loading', 'Fetching data...');

  try {
    const url = `${API_BASE}/api/consumption?breaker_id=${breakerId}&from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}&view=${encodeURIComponent(view)}`;
    const resp = await fetch(url, { cache: "no-store", credentials: 'include' });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      window.alert("Session expired. Please login again.");
      window.location.href = "/login.html";
      throw new Error(`API error (${resp.status}): ${t || resp.statusText}`);

    }

    const d = await resp.json();

    const totalKwh = Number(d.total_kwh || 0);
    let rows = Array.isArray(d.rows) ? d.rows : [];
    rows = sortByTimestampAsc(rows);

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log("Total", rows);

      setStatus('', `No data for breaker ${breakerId} in selected period.`);

      noData.classList.add('visible');
      // Provide a debug button to fetch the last parsed CSV rows from the server
      try {
        showLastSamplesInNoData(breakerId, 10);
      } catch (e) {
        // ignore UI helper errors
        console.warn('showLastSamplesInNoData failed', e);
      }
      return;
    }

    // ✅ IMPORTANT: keys in BREAKERS are strings
    const breaker = BREAKERS[String(breakerId)] || { name: `Breaker ${breakerId}`, id: String(breakerId) };

    const invoiceNo = d.invoice_no || `INV-${new Date().toISOString().slice(0, 10)}`;
    const today = (d.generated_at || new Date().toLocaleString("en-GB")).toString();

    const seasons = new Set(rows.map(r => r.season).filter(Boolean));
    const tariffText = seasons.size === 1
      ? `ToU — ${seasonLabel([...seasons][0])} (Before VAT)`
      : `ToU — Seasonal (Before VAT)`;

    const peakKwh = Number(d.peak_kwh || 0);
    const offKwh = Number(d.offpeak_kwh || 0);
    const peakAmt = Number(d.peak_amount || 0);
    const offAmt = Number(d.offpeak_amount || 0);
    const grand = Number(d.total_amount || 0);

    const pd = d.peak_definition || {};
    const peakLine = `Peak — ${pd.days || "Sun–Thu only"} | Winter/Transition ${pd.winter_shoulder_hours || "17:00–22:00"} | Summer ${pd.summer_hours || "17:00–23:00"}`;
    const offLine = `Off-Peak — All other hours + Fri/Sat`;

    // ===== Screen table + chart (same as before) =====
    let tableRows = "";
    const chartLabels = [];
    const chartPeak = [];
    const chartOff = [];

    if (view === "monthly") {
      rows.forEach(r => {
        const dPk = Number(r.peak_kwh || 0);
        const dOff = Number(r.off_kwh || 0);
        const dTot = Number(r.kwh || 0);
        const dAmt = Number(r.amount || 0);

        tableRows += `<tr>
          <td>${gbMonth(r.timestamp)}</td>
          <td>
            <span class="tag pk" style="margin-right:3px">Pk: ${fmtKwh(dPk)}</span>
            <span class="tag op">Off: ${fmtKwh(dOff)}</span>
          </td>
          <td class="n">${fmtKwh(dTot)}</td>
          <td class="n">Monthly</td>
          <td class="n">${fmtMoney(dAmt)}</td>
        </tr>`;

        chartLabels.push(shortMonth(r.timestamp));
        chartPeak.push(dPk);
        chartOff.push(dOff);
      });
    } else if (view === "daily") {
      rows.forEach(r => {
        const dPk = Number(r.peak_kwh || 0);
        const dOff = Number(r.off_kwh || 0);
        const dTot = Number(r.kwh || 0);
        const dAmt = Number(r.amount || 0);

        tableRows += `<tr>
          <td>${gbDate(r.timestamp)}</td>
          <td>
            <span class="tag pk" style="margin-right:3px">Pk: ${fmtKwh(dPk)}</span>
            <span class="tag op">Off: ${fmtKwh(dOff)}</span>
          </td>
          <td class="n">${fmtKwh(dTot)}</td>
          <td class="n">Mixed</td>
          <td class="n">${fmtMoney(dAmt)}</td>
        </tr>`;

        chartLabels.push(shortDay(r.timestamp));
        chartPeak.push(dPk);
        chartOff.push(dOff);
      });
    } else {
      // hourly
      rows.forEach(r => {
        const type = r.type || "Off-Peak";
        const pk = (type === "Peak");
        const kwh = Number(r.kwh || 0);

        tableRows += `<tr class="${pk ? 'pk-row' : ''}">
          <td>${gbStamp(r.timestamp)}</td>
          <td><span class="tag ${pk ? 'pk' : 'op'}">${pk ? 'Peak' : 'Off-Peak'}</span></td>
          <td class="n">${fmtKwh(kwh)}</td>
          <td class="n">${fmtRate(r.rate)}</td>
          <td class="n">${fmtMoney(r.amount)}</td>
        </tr>`;

        chartLabels.push(hhFromStamp(r.timestamp));
        chartPeak.push(pk ? kwh : 0);
        chartOff.push(pk ? 0 : kwh);
      });
    }

    // ===== PDF rows = ALWAYS DAILY =====
    const dailyRowsForPrint = (view === "daily" || view === "monthly") ? rows : aggregateHourlyToDaily(rows);

    // Build clear "row list" for PDF
    let pdfRows = "";
    dailyRowsForPrint.forEach(r => {
      const dPk = Number(r.peak_kwh || 0);
      const dOff = Number(r.off_kwh || 0);
      const dTot = Number(r.kwh || 0);
      const dAmt = Number(r.amount || 0);

      pdfRows += `
        <div class="row">
          <div class="d">${gbDate(r.timestamp)}</div>

          <div class="cell">
            <div class="k">Peak</div>
            <div class="v"><strong>${fmtKwh(dPk)}</strong> kWh</div>
          </div>

          <div class="cell">
            <div class="k">Off-peak</div>
            <div class="v"><strong>${fmtKwh(dOff)}</strong> kWh</div>
          </div>

          <div class="cell">
            <div class="k">Total</div>
            <div class="v"><strong>${fmtKwh(dTot)}</strong> kWh</div>
          </div>

          <div class="cell">
            <div class="k">ILS (VAT not included)</div>
            <div class="v"><strong>${fmtMoney(dAmt)}</strong></div>
          </div>
        </div>
      `;
    });

    const pdfTitleText = view === 'monthly' ? 'Monthly Consumption Invoice' : (view === 'daily' ? 'Daily Consumption Invoice' : 'Consumption Records');

    document.getElementById("print-records").innerHTML = `
      <div class="pdf-page">
        <div class="pdf-header">
          <div class="pdf-head-row">
            <div class="pdf-logo">ABB</div>
            <div class="pdf-title">
              <div class="t1">Energy Monitoring System</div>
              <div class="t2">${pdfTitleText}</div>
            </div>
          </div>

          <div class="pdf-chips">
            <div class="chip"><strong>Breaker:</strong> ${breaker.name}</div>
            <div class="chip"><strong>ID:</strong> ${breaker.id}</div>
            <div class="chip"><strong>Period:</strong> ${from} → ${to}</div>
            <div class="chip"><strong>Invoice:</strong> ${invoiceNo}</div>
          </div>
        </div>

        <div class="pdf-summary">
          <div class="sum-total">
            <div class="k">Total due</div>
            <div class="v">${fmtMoney(grand)} <span style="font-size:13px;font-weight:800;opacity:.75">ILS</span></div>
          </div>

          <div class="sum-box pk">
            <div class="k">Peak summary</div>
            <div class="v">${fmtKwh(peakKwh)} kWh</div>
            <div class="s">${fmtMoney(peakAmt)} ILS</div>
          </div>

          <div class="sum-box op">
            <div class="k">Off-peak summary</div>
            <div class="v">${fmtKwh(offKwh)} kWh</div>
            <div class="s">${fmtMoney(offAmt)} ILS</div>
          </div>
        </div>

        <div class="pdf-section-title">
          <div class="l">${view === 'monthly' ? 'Monthly records' : 'Daily records'}</div>
          <div class="r">${dailyRowsForPrint.length} ${view === 'monthly' ? 'months' : 'days'} • ${tariffText}</div>
        </div>

        <div class="rowlist">
          ${pdfRows}
        </div>

        <div class="pdf-footer">
          <div><span class="abb">ABB</span> | Energy Report v1.0</div>
          <div>Before VAT • IEC ToU • Generated: ${today}</div>
        </div>
      </div>
    `;

    // ===== Render app card =====
    card.innerHTML = `
      <div class="rpt-header">
        <div class="rpt-logo">
          <svg width="86" height="28" viewBox="0 0 86 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <text x="0" y="20" font-family="DM Sans, Arial, sans-serif" font-weight="900" font-size="20" fill="#FFFFFF">ABB</text>
          </svg>
        </div>
        <div class="rpt-header-right">
          <div class="rpt-type">Energy Report — ${view === 'hourly' ? 'Hourly' : view === 'daily' ? 'Daily' : 'Monthly'} View</div>
          <div class="rpt-name">${breaker.name}</div>
        </div>
      </div>

      <div class="rpt-subbar">
        <span class="sl">Breaker Energy Invoice</span>
        <span class="sr">#${invoiceNo} &nbsp;|&nbsp; ${today}</span>
      </div>

      <div class="rpt-meta">
        <div class="rpt-meta-cell"><div class="ml">Breaker ID</div><div class="mv">${breaker.id}</div></div>
        <div class="rpt-meta-cell"><div class="ml">From</div><div class="mv">${from}</div></div>
        <div class="rpt-meta-cell"><div class="ml">To</div><div class="mv">${to}</div></div>
        <div class="rpt-meta-cell"><div class="ml">Tariff</div><div class="mv">${tariffText}</div></div>
        <div class="rpt-meta-cell"><div class="ml">Total</div><div class="mv">${fmtKwh(totalKwh)} kWh</div></div>
      </div>

      <div class="rpt-legend">
        <div class="rpt-legend-item"><div class="sw pk"></div><span><strong>${peakLine}</strong></span></div>
        <div class="rpt-legend-item"><div class="sw op"></div><span><strong>${offLine}</strong></span></div>
      </div>

      <div class="rpt-body">
        <div class="rpt-chart-panel">
          <div class="rpt-chart-title">&#9650; Consumption — ${view === 'hourly' ? 'Hourly Breakdown' : view === 'daily' ? 'Daily Summary' : 'Monthly Summary'}</div>
          <div class="chart-container"><canvas id="rpt-chart"></canvas></div>

          <div class="chart-pills">
            <div class="pill pk">
              <div class="pl">Peak Hours</div>
              <div class="pv">${fmtKwh(peakKwh)} kWh</div>
              <div class="ps">${fmtMoney(peakAmt)} ILS</div>
            </div>
            <div class="pill op">
              <div class="pl">Off-Peak Hours</div>
              <div class="pv">${fmtKwh(offKwh)} kWh</div>
              <div class="ps">${fmtMoney(offAmt)} ILS</div>
            </div>
          </div>
        </div>

        <div class="rpt-table-panel">
          <div class="rpt-table-wrap" style="padding-top:16px;">
            <table class="rpt-table">
              <thead><tr>
                <th>${view === 'hourly' ? 'Time' : 'Date'}</th>
                <th>Type</th><th>kWh</th><th>Rate</th><th>ILS</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="rpt-totals">
        <div>
          <div class="rpt-tot-lines">
            <div class="rpt-tot-line-peak"><span>&#9632; Peak — ${fmtKwh(peakKwh)} kWh</span><span class="tv">${fmtMoney(peakAmt)} ILS</span></div>
            <div class="rpt-tot-line-off"><span>&#9632; Off-Peak — ${fmtKwh(offKwh)} kWh</span><span class="tv">${fmtMoney(offAmt)} ILS</span></div>
             <div class="rpt-tot-line-total"><span>&#9632; Total — ${fmtKwh(totalKwh)} kWh</span><span class="tv">${fmtMoney(grand)} ILS</span></div>
          </div>
          <div class="rpt-note">Tariffs are BEFORE VAT — seasonal ToU pricing (IEC)</div>
        </div>

        <div class="rpt-total-box">
          <div class="tbl">Total Due</div>
          <div class="tba">${fmtMoney(grand)}</div>
          <div class="tbc">ILS</div>
        </div>
      </div>

      <div class="rpt-export-bar">
        <button class="btn-print" onclick="printRecordsOnly()">
          <svg viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
          Export to PDF
        </button>
      </div>

      <div class="rpt-footer">
        <span>
          <svg width="72" height="18" viewBox="0 0 86 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <text x="0" y="14" font-family="DM Sans, Arial, sans-serif" font-weight="900" font-size="14" fill="#FF000F">ABB</text>
          </svg>
          Energy Monitoring System | Breaker Report v1.0
        </span>
        <span>energyData.csv | ${today}</span>
      </div>
    `;

    card.classList.add('visible');

    // Chart
    await ensureChart();
    const ctx = document.getElementById('rpt-chart').getContext('2d');
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [
          { label: 'Peak', data: chartPeak, backgroundColor: 'rgba(255,0,15,0.85)', borderRadius: 2, borderSkipped: false },
          { label: 'Off-Peak', data: chartOff, backgroundColor: 'rgba(26,26,26,0.72)', borderRadius: 2, borderSkipped: false },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'DM Sans', size: 12, weight: '800' }, boxWidth: 12, boxHeight: 12, padding: 16 } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y} kWh` } }
        },
        scales: {
          x: { stacked: true, ticks: { font: { family: 'DM Mono', size: 9 }, maxRotation: 55, color: '#888' }, grid: { display: false } },
          y: { stacked: true, title: { display: true, text: 'kWh', font: { family: 'DM Sans', size: 13 }, color: '#aaa' }, ticks: { font: { family: 'DM Mono', size: 11 }, color: '#888' }, grid: { color: '#f0f0f0' } }
        }
      }
    });

    setStatus('active', `Report ready — ${breaker.name} | ${view} view | ${from} → ${to} | PDF = clear rows`);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    addCompareBreakerButtonAfterReport();

  } catch (e) {
    console.error(e);
    setStatus('', `Error: ${e.message || e}`);
    noData.classList.add('visible');
  }
}

document.addEventListener('keydown', e => { if (e.key === 'Enter') generateReport(); });

/* Set sensible default dates for the From/To inputs (YYYY-MM-DD) */
function setDefaultDates() {
  try {
    const fromEl = document.getElementById('sel-from');
    const toEl = document.getElementById('sel-to');
    const now = new Date();
    const toVal = now.toISOString().slice(0, 10);
    // set From = yesterday, To = today
    const fromDt = new Date(now);
    fromDt.setDate(fromDt.getDate() - 1);
    const fromVal = fromDt.toISOString().slice(0, 10);
    if (fromEl && !fromEl.value) fromEl.value = fromVal;
    if (toEl && !toEl.value) toEl.value = toVal;
  } catch (e) {
    // ignore
  }
}

// ✅ init
setDefaultDates();
loadBreakersAndFillSelect();
// Show logout button when user is authenticated
async function updateAuthUi() {
  try {
    const resp = await fetch('/api/me', { cache: 'no-store', credentials: 'include' });
    const data = await resp.json().catch(() => ({}));
    const btn = document.getElementById('btn-logout');
    if (resp.ok) {
      if (btn) btn.style.display = 'inline-flex';
    } else {
      if (btn) btn.style.display = 'none';
    }
  } catch (e) {
    const btn = document.getElementById('btn-logout'); if (btn) btn.style.display = 'none';
  }
}

updateAuthUi();

// Logout helper
document.getElementById('btn-logout').addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch (e) {
    // ignore
  }
  // Reload so server serves login page
  window.location.href = '/';
});