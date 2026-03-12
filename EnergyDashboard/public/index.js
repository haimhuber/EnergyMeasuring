// --- Highlight current season in summary bar ---
function highlightCurrentSeasonInBar() {
  // Remove previous highlight
  document.querySelectorAll('.tariff-season').forEach(el => el.classList.remove('current-season'));
  // Determine current season
  const now = new Date();
  const m = now.getMonth() + 1;
  let season = 'shoulder';
  if (m === 12 || m === 1 || m === 2) season = 'winter';
  else if (m >= 6 && m <= 9) season = 'summer';
  // Highlight
  const el = document.getElementById('tariff-' + season);
  if (el) el.classList.add('current-season');
}

// Run highlight on load unless the user disabled it (persisted in localStorage)
document.addEventListener('DOMContentLoaded', () => {
  try {
    const auto = localStorage.getItem('autoHighlightSeason');
    if (auto === 'false') return; // user opted out
  } catch (e) {
    // ignore localStorage errors
  }
  highlightCurrentSeasonInBar();
});

// Helpers exposed to the console so you can toggle the behaviour without editing code:
window.setAutoHighlightSeason = function (enabled) {
  try {
    localStorage.setItem('autoHighlightSeason', enabled ? 'true' : 'false');
    return true;
  } catch (e) {
    return false;
  }
};
window.getAutoHighlightSeason = function () {
  try { return localStorage.getItem('autoHighlightSeason'); } catch (e) { return null; }
};
// --- Tariff Summary Bar Fill ---
async function fillTariffSummaryBar() {
  try {
    const resp = await fetch('/api/tariffs', { credentials: 'include' });
    if (!resp.ok) throw new Error('Failed to load tariffs');
    const data = await resp.json();
    if (data.tariffs && data.vat != null) {
      // Winter
      document.querySelector('#tariff-winter .tariff-off').textContent = data.tariffs.winter.off;
      document.querySelector('#tariff-winter .tariff-peak').textContent = data.tariffs.winter.peak;
      // Shoulder
      document.querySelector('#tariff-shoulder .tariff-off').textContent = data.tariffs.shoulder.off;
      document.querySelector('#tariff-shoulder .tariff-peak').textContent = data.tariffs.shoulder.peak;
      // Summer
      document.querySelector('#tariff-summer .tariff-off').textContent = data.tariffs.summer.off;
      document.querySelector('#tariff-summer .tariff-peak').textContent = data.tariffs.summer.peak;
      // VAT
      document.getElementById('tariff-vat-summary').textContent = data.vat;
    }
  } catch (err) {
    // fallback: show dashes
    document.querySelectorAll('.tariff-off, .tariff-peak').forEach(e => e.textContent = '-');
    document.getElementById('tariff-vat-summary').textContent = '-';
  }
}

// --- Tariff Modal Logic ---
document.addEventListener('DOMContentLoaded', function () {
  const btnSettings = document.getElementById('btn-settings');
  const tariffModalOverlay = document.getElementById('tariff-modal-overlay');
  const tariffModalClose = document.getElementById('tariff-modal-close');
  const tariffForm = document.getElementById('tariff-form');
  if (btnSettings) {
    btnSettings.style.visibility = 'visible';
    btnSettings.addEventListener('click', async function () {
      // Check is user is admin before allowing access to tariff settings
      const currentRole = await adjustUIForUserRole();
      if (currentRole !== 'admin') {
        showAbbModal('Session Expired', 'Your session has expired or you do not have permission to access tariff settings. Please log in again.');
        window.location.href = '/login';
        return;
      }
      // Fetch tariffs from API and populate fields
      try {
        const resp = await fetch('/api/tariffs', { credentials: 'include' });
        if (!resp.ok) throw new Error('Failed to load tariffs');
        const data = await resp.json();
        if (data.tariffs && data.vat != null) {
          // Winter
          document.getElementById('winter-off').value = data.tariffs.winter.off ?? '';
          document.getElementById('winter-peak').value = data.tariffs.winter.peak ?? '';
          // Shoulder
          document.getElementById('shoulder-off').value = data.tariffs.shoulder.off ?? '';
          document.getElementById('shoulder-peak').value = data.tariffs.shoulder.peak ?? '';
          // Summer
          document.getElementById('summer-off').value = data.tariffs.summer.off ?? '';
          document.getElementById('summer-peak').value = data.tariffs.summer.peak ?? '';
          // VAT (single input)
          document.getElementById('tariff-vat').value = data.vat ?? '';
        }
      } catch (err) {
        showAbbModal('Failed to load tariff rates from server.');
      }
      tariffModalOverlay.classList.remove('hidden');
    });
  }
  if (tariffModalClose) {
    tariffModalClose.addEventListener('click', function () {
      tariffModalOverlay.classList.add('hidden');
    });
  }
  if (tariffModalOverlay) {
    tariffModalOverlay.addEventListener('click', function (e) {
      if (e.target === tariffModalOverlay) {
        tariffModalOverlay.classList.add('hidden');
      }
    });
  }
  if (tariffForm) {
    tariffForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const tariffData = {
        winter: {
          off: document.getElementById('winter-off').value,
          peak: document.getElementById('winter-peak').value
        },
        shoulder: {
          off: document.getElementById('shoulder-off').value,
          peak: document.getElementById('shoulder-peak').value
        },
        summer: {
          off: document.getElementById('summer-off').value,
          peak: document.getElementById('summer-peak').value
        },
        vat: document.getElementById('tariff-vat').value
      };
      // Save to localStorage for offline fallback
      localStorage.setItem('tariffData', JSON.stringify(tariffData));
      // Send to server
      try {
        const resp = await fetch('/api/change-tariffs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(tariffData)
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          tariffModalOverlay.classList.add('hidden');
          showAbbModal('Failed to update tariffs', err.detail || 'Server error');
          return;
        }
        tariffModalOverlay.classList.add('hidden');
        showAbbModal('Tariff rates updated successfully!');
        // Refresh summary bar with new values
        await fillTariffSummaryBar();
      } catch (err) {
        tariffModalOverlay.classList.add('hidden');
        showAbbModal('Failed to update tariffs', err?.message || 'Network/server error');
        console.log(err.message);

      }
    });
  }
  // Load saved values if exist
  if (tariffForm) {
    const saved = localStorage.getItem('tariffData');
    if (saved) {
      try {
        const tariffData = JSON.parse(saved);
        if (tariffData.winter) {
          document.getElementById('winter-off').value = tariffData.winter.off || '';
          document.getElementById('winter-peak').value = tariffData.winter.peak || '';
        }
        if (tariffData.shoulder) {
          document.getElementById('shoulder-off').value = tariffData.shoulder.off || '';
          document.getElementById('shoulder-peak').value = tariffData.shoulder.peak || '';
        }
        if (tariffData.summer) {
          document.getElementById('summer-off').value = tariffData.summer.off || '';
          document.getElementById('summer-peak').value = tariffData.summer.peak || '';
        }
        if (tariffData.vat !== undefined) {
          document.getElementById('tariff-vat').value = tariffData.vat || '';
        }
      } catch (e) { }
    }
  }
});
// Msg alarimgent: This file contains recent edits. Please review the changes carefully before suggesting code that has been deleted or significantly modified.
const abbModalOverlay = document.getElementById("abb-modal-overlay");
const abbModalTitle = document.getElementById("abb-modal-title");
const abbModalMessage = document.getElementById("abb-modal-message");
const abbModalOk = document.getElementById("abb-modal-ok");
const abbModalClose = document.getElementById("abb-modal-close");

function showAbbModal(title, message) {
  abbModalTitle.textContent = title || "System message";
  abbModalMessage.textContent = message || "";
  abbModalOverlay.classList.remove("hidden");
  abbModalOk.focus();
}

function hideAbbModal() {
  abbModalOverlay.classList.add("hidden");
}

abbModalOk.addEventListener("click", hideAbbModal);
abbModalClose.addEventListener("click", hideAbbModal);

abbModalOverlay.addEventListener("click", (e) => {
  if (e.target === abbModalOverlay) {
    hideAbbModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !abbModalOverlay.classList.contains("hidden")) {
    hideAbbModal();
  }
});

// --- Add Breaker for Comparison Button ---
async function addCompareBreakerButtonAfterReport() {
  // Check if session token exists before allowing comparison (prevents confusion if API calls would fail)
  try {
    const token = await fetch(`${API_BASE}/api/me`);
    const data = await token.json();
    if (data?.user?.role === "Expired") {
      showAbbModal('Your session has expired. Please log in again to compare breakers.');
      window.location.href = '/login';
      return;
    } else if (data?.user?.role !== "admin") {
      return;
    }
  } catch (e) {
    setStatus('error', 'You must be logged in to compare breakers.');
    return;
  }
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
// --- Delete Comparison Button ---
function deleteCompareBreakerButton() {
  // Remove if already exists
  const oldBtn = document.getElementById('add-breaker-compare-btn');
  if (oldBtn) oldBtn.remove();
}


// --- Get Tarrriff type (Peak/Off-Peak) \\---

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
  title.style.textAlign = 'left';
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
  okBtn.style.marginLeft = '0';
  okBtn.onclick = async function () {
    const selectedId = select.value;
    if (!selectedId) return;
    if (comparisonBreakers.length >= 2) {
      showAbbModal('Comparison Limit Reached', 'You can compare up to 3 breakers total.');
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
  // Button container for left alignment
  const btnContainer = document.createElement('div');
  btnContainer.style.display = 'flex';
  btnContainer.style.justifyContent = 'flex-start';
  btnContainer.style.alignItems = 'flex-start';
  btnContainer.style.gap = '10px';
  btnContainer.style.marginTop = '8px';
  btnContainer.style.paddingLeft = '0';
  btnContainer.style.width = '100%';
  btnContainer.style.direction = 'ltr';
  btnContainer.appendChild(okBtn);
  btnContainer.appendChild(cancelBtn);
  box.appendChild(btnContainer);
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
  box.style.alignContent = 'center';
  const title = document.createElement('div');
  title.textContent = 'Select breaker for comparison';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '12px';
  title.style.textAlign = 'left';
  box.appendChild(title);
  // Restrict hourly comparison to max 1 day
  const from = document.getElementById('sel-from').value;
  const to = document.getElementById('sel-to').value;
  const view = document.querySelector('input[name="view"]:checked').value;
  if (view === 'hourly' && from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffMs = toDate - fromDate;
    if (diffMs > 0) {
      showAbbModal(
        "Invalid report range",
        "Hourly comparison is limited to a single 24-hour period. Please select one day only and run the report again."
      );
      return;
    }
  }
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
    opt.style.alignContent = 'center';
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
      showAbbModal('Comparison Limit Reached', 'You can compare up to 3 breakers total.');
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

// --- Patch: Add comparison breaker as grouped bar dataset to main chart ---
addComparisonBreakerToChart = async function (breakerId) {
  const from = document.getElementById('sel-from').value;
  const to = document.getElementById('sel-to').value;
  const view = document.querySelector('input[name="view"]:checked').value;
  if (view === 'hourly' && from > to + 15 * 60 * 60 * 1000) {
    showAbbModal('Invalid date range for hourly view.');
    return;
  }

  // Fetch data
  let d;
  try {
    d = await fetchConsumption(breakerId, from, to, view);
  } catch (e) {
    showAbbModal('Data Fetch Error', 'Failed to fetch data for comparison breaker.');
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
    // hourly: sum all kWh per hour (Peak+Off-Peak)
    const map = {};
    rows.forEach(r => {
      const hour = hhFromStamp(r.timestamp);
      map[hour] = (map[hour] || 0) + Number(r.kwh || 0);
    });
    dataArr = mainLabels.map(lab => map[lab] ?? 0);
  }
  const colorIdx = comparisonBreakers.length - 1;
  const color = comparisonColors[colorIdx % comparisonColors.length];
  chartInstance.data.datasets.push({
    label: BREAKERS[breakerId]?.name || ('Breaker ' + breakerId),
    data: dataArr,
    backgroundColor: color,
    borderColor: color,
    borderWidth: 2,
    borderRadius: 2,
    borderSkipped: false
  });
  chartInstance.options.scales.x.stacked = false;
  chartInstance.options.scales.y.stacked = false;
  chartInstance.update();
};

// Patch: clear only datasets on new report
generateReport = (function (orig) {
  return async function () {
    comparisonBreakers = [];
    await orig.apply(this, arguments);
  };
})(generateReport);

// Add a comparison breaker to the chart (same period/view)
async function addComparisonBreakerToChart(breakerId) {
  // Remove any previous comparison chart for this breaker
  let cmpPanel = document.getElementById('comparison-charts-panel');
  if (!cmpPanel) {
    // Create panel if not exists
    const chartPanel = document.querySelector('.rpt-chart-panel');
    cmpPanel = document.createElement('div');
    cmpPanel.id = 'comparison-charts-panel';
    cmpPanel.style.display = 'flex';
    cmpPanel.style.gap = '24px';
    chartPanel.parentNode.insertBefore(cmpPanel, chartPanel.nextSibling);
  }
  // Create a new chart container
  const cmpContainer = document.createElement('div');
  cmpContainer.className = 'cmp-chart-container';
  cmpContainer.style.width = '340px';
  cmpContainer.style.minWidth = '240px';
  cmpContainer.style.background = '#f8f8f8';
  cmpContainer.style.borderRadius = '10px';
  cmpContainer.style.padding = '12px 8px 8px 8px';
  cmpContainer.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
  cmpContainer.style.display = 'flex';
  cmpContainer.style.flexDirection = 'column';
  cmpContainer.style.alignItems = 'center';
  // Title
  const cmpTitle = document.createElement('div');
  cmpTitle.textContent = BREAKERS[breakerId]?.name || ('Breaker ' + breakerId);
  cmpTitle.style.fontWeight = 'bold';
  cmpTitle.style.marginBottom = '6px';
  cmpTitle.style.fontSize = '15px';
  cmpContainer.appendChild(cmpTitle);
  // Canvas
  const cmpCanvas = document.createElement('canvas');
  cmpCanvas.width = 320;
  cmpCanvas.height = 180;
  cmpContainer.appendChild(cmpCanvas);
  cmpPanel.appendChild(cmpContainer);

  // Fetch and render chart data (reuse logic from original)
  const from = document.getElementById('sel-from').value;
  const to = document.getElementById('sel-to').value;
  const view = document.querySelector('input[name="view"]:checked').value;
  let d;
  try {
    d = await fetchConsumption(breakerId, from, to, view);
  } catch (e) {
    cmpTitle.textContent += ' (No data)';
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
    // hourly: sum all kWh per hour (Peak+Off-Peak)
    const map = {};
    rows.forEach(r => {
      const hour = hhFromStamp(r.timestamp);
      map[hour] = (map[hour] || 0) + Number(r.kwh || 0);
    });
    dataArr = mainLabels.map(lab => map[lab] ?? 0);
  }
  // Render chart in this canvas
  await ensureChart();
  new Chart(cmpCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: mainLabels,
      datasets: [{
        label: 'kWh',
        data: dataArr,
        backgroundColor: comparisonColors[comparisonBreakers.length - 1],
        borderRadius: 2,
        borderSkipped: false
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y} kWh` } }
      },
      scales: {
        x: { ticks: { font: { family: 'DM Mono', size: 9 }, color: '#888' }, grid: { display: false } },
        y: { title: { display: true, text: 'kWh', font: { family: 'DM Sans', size: 13 }, color: '#aaa' }, ticks: { font: { family: 'DM Mono', size: 11 }, color: '#888' }, grid: { color: '#f0f0f0' } }
      }
    }
  });
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
  return userData?.user?.role || "Expired";
}


/* Fetch consumption JSON helper */
async function fetchConsumption(breakerId, from, to, view) {
  const url = `${API_BASE}/api/consumption?breaker_id=${breakerId}&from_date=${encodeURIComponent(from)}&to_date=${encodeURIComponent(to)}&view=${encodeURIComponent(view)}`;
  const resp = await fetch(url, { cache: 'no-store', credentials: 'include' });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    showAbbModal(`API error (${resp.status})`, t || resp.statusText);
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

  Object.values(BREAKERS).forEach(breaker => {

    const label = document.createElement("label");
    label.className = "breaker-item";

    label.innerHTML = `
    <input type="checkbox" value="${breaker.id}">
    ${breaker.displayName}
  `;

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
      showAbbModal('Selection Error', 'Please select at least one breaker to generate the report.');
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
      showAbbModal('Session Expired', 'Please log in again.');
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
          parts.push(`<div style="padding:18px;border:1px solid #000000;margin-bottom:12px;">No data for ${breaker.name} (${id}) in selected period.</div>`);
          continue;
        }

        totalAmount += Number(d.total_amount || 0);

        const tableRows = buildTableRowsHtml(rows, view);

        const part = `
            <div style="border:0px solid #201f1f;border-radius:8px;margin-bottom:18px;overflow:hidden;background:#fff;">
              <div style="padding:12px 16px;border-bottom:1px solid #000000;display:flex;justify-content:space-between;align-items:center;">
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
              <div style="padding:12px 12px; border-top:1px solid #000000; display:flex; justify-content:flex-end; gap:20px;">
        <div style="font-weight:700;">Total due (not included VAT): <span style="font-family:DM Mono,monospace;">${fmtMoney(d.total_amount || 0)} ILS</span></div>
        </div>
        <hr style="margin:30px 0; height:6px; border: solid; background:#e6e6e6;" />
          `;

        parts.push(part);

        // For print: always show daily table and summary, regardless of view
        let dailyRowsForPrint = aggregateHourlyToDaily(rows);
        // Chart for this breaker
        let chartImgHtml = "";
        try {
          // Short date format: D/M
          function shortDayLabel(ts) {
            const d = new Date(ts);
            return d.getDate() + '/' + (d.getMonth() + 1);
          }
          const labels = dailyRowsForPrint.map(r => shortDayLabel(r.timestamp));
          const peakData = dailyRowsForPrint.map(r => Number(r.peak_kwh || 0));
          const offData = dailyRowsForPrint.map(r => Number(r.off_kwh || 0));
          const pdfChartCanvas = document.createElement('canvas');
          pdfChartCanvas.width = 900;
          pdfChartCanvas.height = 320;
          const ctx = pdfChartCanvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, pdfChartCanvas.width, pdfChartCanvas.height);
          const chartLeft = 60, chartTop = 40, chartWidth = 780, chartHeight = 200;
          const maxVal = Math.max(...peakData, ...offData, 10);
          ctx.strokeStyle = '#bbb';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(chartLeft, chartTop);
          ctx.lineTo(chartLeft, chartTop + chartHeight);
          ctx.lineTo(chartLeft + chartWidth, chartTop + chartHeight);
          ctx.stroke();
          const barWidth = Math.max(10, Math.floor(chartWidth / (labels.length * 2)));
          for (let i = 0; i < labels.length; i++) {
            const offH = (offData[i] / maxVal) * chartHeight;
            ctx.fillStyle = '#444';
            ctx.fillRect(chartLeft + i * barWidth * 2, chartTop + chartHeight - offH, barWidth, offH);
            const peakH = (peakData[i] / maxVal) * chartHeight;
            ctx.fillStyle = '#e53935';
            ctx.fillRect(chartLeft + i * barWidth * 2, chartTop + chartHeight - peakH, barWidth, peakH);
          }
          ctx.font = 'bold 12px DM Mono, monospace';
          ctx.textAlign = 'center';
          for (let i = 0; i < labels.length; i++) {
            ctx.save();
            ctx.translate(chartLeft + i * barWidth * 2 + barWidth / 2, chartTop + chartHeight + 16);
            ctx.rotate(-0.10);
            ctx.fillStyle = '#fff';
            ctx.fillRect(-18, -12, 36, 16);
            ctx.fillStyle = '#111';
            ctx.fillText(labels[i], 0, 0);
            ctx.restore();
          }
          ctx.textAlign = 'right';
          ctx.font = '13px DM Mono, monospace';
          for (let y = 0; y <= 5; y++) {
            const val = Math.round((maxVal * (5 - y)) / 5);
            ctx.fillStyle = '#888';
            ctx.fillText(val + ' kWh', chartLeft - 8, chartTop + (chartHeight * y) / 5 + 4);
          }
          // Legend (top right)
          const legendY = chartTop - 36;
          let lx = chartLeft + chartWidth - 120;
          ctx.save();
          ctx.font = 'bold 13px DM Sans, Arial, sans-serif';
          ctx.fillStyle = '#e53935';
          ctx.fillRect(lx, legendY, 18, 10);
          ctx.fillStyle = '#222';
          ctx.fillText('Peak', lx + 28, legendY + 10);
          lx += 70;
          ctx.fillStyle = '#444';
          ctx.fillRect(lx, legendY, 18, 10);
          ctx.fillStyle = '#222';
          ctx.fillText('Off-Peak', lx + 38, legendY + 10);
          ctx.restore();
          ctx.font = 'bold 18px DM Sans, Arial, sans-serif';
          ctx.fillStyle = '#222';
          ctx.fillText('Consumption — Daily Breakdown', chartLeft + chartWidth / 2, chartTop - 40);
          const chartDataUrl = pdfChartCanvas.toDataURL('image/png');
          chartImgHtml = `<div style=\"margin:18px 0 18px 0;text-align:center;\"><img src=\"${chartDataUrl}\" style=\"max-width:100%;height:auto;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);\" alt=\"Consumption Chart\"></div>`;
        } catch (e) { /* ignore errors */ }
        // Table
        let pdfRows = `<table class='pdf-table'><thead><tr><th>Date</th><th>Peak (kWh)</th><th>Off-peak (kWh)</th><th>Total (kWh)</th><th>ILS (VAT not included)</th></tr></thead><tbody>`;
        dailyRowsForPrint.forEach(r => {
          const dPk = Number(r.peak_kwh || 0);
          const dOff = Number(r.off_kwh || 0);
          const dTot = Number(r.kwh || 0);
          const dAmt = Number(r.amount || 0);
          function shortDayLabel(ts) { const d = new Date(ts); return d.getDate() + '/' + (d.getMonth() + 1); }
          pdfRows += `<tr><td>${shortDayLabel(r.timestamp)}</td><td>${fmtKwh(dPk)}</td><td>${fmtKwh(dOff)}</td><td>${fmtKwh(dTot)}</td><td>${fmtMoney(dAmt)}</td></tr>`;
        });
        pdfRows += `</tbody></table>`;
        // Only one PDF page for all breakers
        // Define 'today' for the PDF footer
        const today = new Date();
        const todayStr = today.getDate().toString().padStart(2, '0') + '/' + (today.getMonth() + 1).toString().padStart(2, '0') + '/' + today.getFullYear();
        printParts.push(`
          <div class=\"pdf-page\"> 
            <div class=\"pdf-header\">
              <div class=\"pdf-logo\">ABB</div>
              <div class=\"pdf-title\" style=\"text-align:right;\">
                <div class=\"t1\" style=\"font-size:13px;letter-spacing:2px;font-weight:400;opacity:.7;\">ENERGY MONITORING SYSTEM</div>
                <div class=\"t2\" style=\"font-size:1.35em;font-weight:700;letter-spacing:0.5px;\">Consumption Records</div>
              </div>
            </div>
            <div class=\"pdf-chips\">
              <div class=\"chip\"><strong>Breaker:</strong> ${breaker.name}</div>
              <div class=\"chip\"><strong>ID:</strong> ${breaker.id}</div>
              <div class=\"chip\"><strong>Period:</strong> ${from} → ${to}</div>
              <div class=\"chip\"><strong>Invoice:</strong> ${d.invoice_no || ''}</div>
            </div>
            <div class=\"pdf-summary\">
              <div class=\"sum-total\"><div class=\"k\">TOTAL DUE</div><div class=\"v\" style=\"font-size:2.5em;font-weight:700;letter-spacing:1px;\">${fmtMoney(d.total_amount || 0)} <span style=\"font-size:0.5em;font-weight:800;opacity:.75\">ILS</span></div></div>
              <div class=\"sum-box pk\" style=\"border-left:4px solid #e53935;\"><div class=\"k\" style=\"font-size:0.95em;letter-spacing:1px;color:#e53935;font-weight:700;\">PEAK SUMMARY</div><div class=\"v\" style=\"font-size:1.5em;font-weight:700;\">${fmtKwh(d.peak_kwh || 0)} kWh</div><div class=\"s\" style=\"font-size:1.1em;color:#1976d2;\">${fmtMoney(d.peak_amount || 0)} ILS</div></div>
              <div class=\"sum-box op\" style=\"border-left:4px solid #1976d2;\"><div class=\"k\" style=\"font-size:0.95em;letter-spacing:1px;color:#1976d2;font-weight:700;\">OFF-PEAK SUMMARY</div><div class=\"v\" style=\"font-size:1.5em;font-weight:700;\">${fmtKwh(d.offpeak_kwh || 0)} kWh</div><div class=\"s\" style=\"font-size:1.1em;color:#1976d2;\">${fmtMoney(d.offpeak_amount || 0)} ILS</div></div>
            </div>
            ${chartImgHtml}
            <div class=\"pdf-section-title\" style=\"margin-top:18px;\"><div class=\"l\" style=\"font-size:1.1em;font-weight:700;letter-spacing:1px;\">DAILY TABLE</div><div class=\"r\" style=\"font-size:1em;opacity:.7;\">${dailyRowsForPrint.length} days</div></div>
            <div class=\"rowlist\">${pdfRows}</div>
            <div class=\"pdf-footer\"><div><span class=\"abb\">ABB</span> | Energy Report v1.0</div><div>Before VAT • IEC ToU • Generated: ${todayStr}</div></div>
          </div>
        `);
      }

      // render combined UI
      card.innerHTML = `
        ${parts.join('\n')}
        <div style="display:flex;justify-content:flex-end;margin:24px 0 0 0;">
          <button class="btn-print" onclick="printRecordsOnly()">Print records</button>
        </div>
        <div style="font-size:1.2em;font-weight:700;margin:24px 0 0 0;text-align:left;color:#111;">Total for all breakers: <span style="font-family:DM Mono,monospace;">${fmtMoney(totalAmount)} ILS</span></div>
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
  deleteCompareBreakerButton();// delete compare button in multi-breaker mode
}

/** ✅ Load breakers from API and fill the select */
async function loadBreakersAndFillSelect() {
  const select = document.getElementById("sel-breaker");

  try {
    setStatus("loading", "Loading breakers...");

    const res = await fetch(`${API_BASE}/api/breakers`, {
      cache: "no-store",
      credentials: "include"
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Breakers API error (${res.status}): ${t || res.statusText}`);
    }

    const data = await res.json();

    // ✅ data is ARRAY: ["1 - Q0 Roof", "2 - AEMAC", ...]
    const list = Array.isArray(data) ? data : [];

    // ✅ Build BREAKERS as object map: BREAKERS["1"] = { id:"1", name:"Q0 Roof", displayName:"1 - Q0 Roof" }
    BREAKERS = Object.fromEntries(
      list.map(text => {
        const value = String(text || "").trim();
        const [idPart, ...nameParts] = value.split(" - ");
        const id = idPart?.trim();
        const name = nameParts.join(" - ").trim() || `Breaker ${id}`;

        return [id, { id, name, displayName: value }];
      }).filter(([id]) => id)
    );

    // ✅ clear existing options (keep placeholder)
    select.length = 1;

    try {
      if (await adjustUIForUserRole() === "admin") {
        Object.entries(BREAKERS)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .forEach(([key, breaker]) => {
            const option = document.createElement("option");
            option.value = breaker.id;
            option.textContent = breaker.displayName;
            select.appendChild(option);
          });

        setStatus("", "Ready.");
      } else {
        const guestBreaker = BREAKERS["5"];

        if (guestBreaker) {
          const option = document.createElement("option");
          option.value = guestBreaker.id;
          option.textContent = guestBreaker.displayName;
          select.appendChild(option);
        }

        document.querySelector(".btn-generate-total-cost").style.visibility = "hidden";
        setStatus("", "Ready. (Guest view: breakers list are limited for report generation)");
      }
    } catch (e) {
      console.warn("Failed to verify session while loading breakers, filling from local data if available", e);
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
    showAbbModal('Selection Error', 'Please select a breaker before generating the report.');
    return;
  }
  if (!from || !to) {
    setStatus('', 'Please select a date range.');
    showAbbModal('Selection Error', 'Please select a date range before generating the report.');
    return;
  }
  if (from > to) {
    setStatus('', 'Invalid date range: "From" date is after "To" date.');
    showAbbModal('Invalid Date Range', 'Invalid date range: "From" date is after "To" date. Please correct the dates and try again.');
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

      if (resp.status === 401) {
        showAbbModal('Session Expired', 'Please login again.');
        window.location.href = "/login.html";
        return;
      }

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
      ? `ToU — ${seasonLabel([...seasons][0])} (Before VAT )`
      : `ToU — Seasonal (Before  VAT )`;

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


    // ===== PDF rows: daily for hourly/daily, monthly for monthly =====
    let pdfRows = "";
    let dailyRowsForPrint = [];
    if (view === "monthly") {
      dailyRowsForPrint = rows;
      pdfRows += `<table class='pdf-table'><thead><tr><th>Month</th><th>Peak (kWh)</th><th>Off-peak (kWh)</th><th>Total (kWh)</th><th>ILS (VAT not included)</th></tr></thead><tbody>`;
      rows.forEach(r => {
        const dPk = Number(r.peak_kwh || 0);
        const dOff = Number(r.off_kwh || 0);
        const dTot = Number(r.kwh || 0);
        const dAmt = Number(r.amount || 0);
        pdfRows += `<tr><td>${gbMonth(r.timestamp)}</td><td>${fmtKwh(dPk)}</td><td>${fmtKwh(dOff)}</td><td>${fmtKwh(dTot)}</td><td>${fmtMoney(dAmt)}</td></tr>`;
      });
      pdfRows += `</tbody></table>`;
    } else {
      // daily for daily/hourly
      dailyRowsForPrint = view === "hourly" ? aggregateHourlyToDaily(rows) : rows;
      pdfRows += `<table class='pdf-table'><thead><tr><th>Date</th><th>Peak (kWh)</th><th>Off-peak (kWh)</th><th>Total (kWh)</th><th>ILS (VAT not included)</th></tr></thead><tbody>`;
      dailyRowsForPrint.forEach(r => {
        const dPk = Number(r.peak_kwh || 0);
        const dOff = Number(r.off_kwh || 0);
        const dTot = Number(r.kwh || 0);
        const dAmt = Number(r.amount || 0);
        pdfRows += `<tr><td>${gbDate(r.timestamp)}</td><td>${fmtKwh(dPk)}</td><td>${fmtKwh(dOff)}</td><td>${fmtKwh(dTot)}</td><td>${fmtMoney(dAmt)}</td></tr>`;
      });
      pdfRows += `</tbody></table>`;
    }

    const pdfTitleText = view === 'monthly' ? 'Monthly Consumption Invoice' : (view === 'daily' ? 'Daily Consumption Invoice' : 'Consumption Records');


    // Always create a daily bar chart for the PDF, regardless of view
    let chartImgHtml = "";
    try {
      // Prepare daily data
      let dailyRowsForChart = [];
      if (view === "monthly") {
        // For monthly, show monthly bars
        dailyRowsForChart = rows;
      } else {
        // For daily/hourly, aggregate to daily
        dailyRowsForChart = view === "hourly" ? aggregateHourlyToDaily(rows) : rows;
      }
      // Create a hidden canvas
      const pdfChartCanvas = document.createElement('canvas');
      pdfChartCanvas.width = 900;
      pdfChartCanvas.height = 320;
      const ctx = pdfChartCanvas.getContext('2d');
      // White background
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, pdfChartCanvas.width, pdfChartCanvas.height);
      // Prepare data
      // Short date format: D/M
      function shortDayLabel(ts) {
        const d = new Date(ts);
        return d.getDate() + '/' + (d.getMonth() + 1);
      }
      const labels = dailyRowsForChart.map(r => view === 'monthly' ? gbMonth(r.timestamp) : shortDayLabel(r.timestamp));
      const peakData = dailyRowsForChart.map(r => Number(r.peak_kwh || 0));
      const offData = dailyRowsForChart.map(r => Number(r.off_kwh || 0));
      // Chart area
      const chartLeft = 60, chartTop = 40, chartWidth = 780, chartHeight = 200;
      // Find max value
      const maxVal = Math.max(...peakData, ...offData, 10);
      // Draw axes
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(chartLeft, chartTop);
      ctx.lineTo(chartLeft, chartTop + chartHeight);
      ctx.lineTo(chartLeft + chartWidth, chartTop + chartHeight);
      ctx.stroke();
      // Draw bars
      const barWidth = Math.max(10, Math.floor(chartWidth / (labels.length * 2)));
      for (let i = 0; i < labels.length; i++) {
        // Off-peak bar (gray)
        const offH = (offData[i] / maxVal) * chartHeight;
        ctx.fillStyle = '#444';
        ctx.fillRect(chartLeft + i * barWidth * 2, chartTop + chartHeight - offH, barWidth, offH);
        // Peak bar (red)
        const peakH = (peakData[i] / maxVal) * chartHeight;
        ctx.fillStyle = '#e53935';
        ctx.fillRect(chartLeft + i * barWidth * 2, chartTop + chartHeight - peakH, barWidth, peakH);
      }
      // Draw labels (dates)
      ctx.font = 'bold 12px DM Mono, monospace';
      ctx.textAlign = 'center';
      for (let i = 0; i < labels.length; i++) {
        ctx.save();
        ctx.translate(chartLeft + i * barWidth * 2 + barWidth / 2, chartTop + chartHeight + 16);
        ctx.rotate(-0.10);
        // Draw white background for label
        ctx.fillStyle = '#fff';
        ctx.fillRect(-18, -12, 36, 16);
        // Draw label text
        ctx.fillStyle = '#111';
        ctx.fillText(labels[i], 0, 0);
        ctx.restore();
      }
      // Draw Y axis labels
      ctx.textAlign = 'right';
      ctx.font = '13px DM Mono, monospace';
      for (let y = 0; y <= 5; y++) {
        const val = Math.round((maxVal * (5 - y)) / 5);
        ctx.fillStyle = '#888';
        ctx.fillText(val + ' kWh', chartLeft - 8, chartTop + (chartHeight * y) / 5 + 4);
      }
      // Draw legend (top right, spaced)
      const legendY = chartTop - 36;
      let lx = chartLeft + chartWidth - 120;
      ctx.save();
      ctx.font = 'bold 13px DM Sans, Arial, sans-serif';
      // Peak
      ctx.fillStyle = '#e53935';
      ctx.fillRect(lx, legendY, 18, 10);
      ctx.fillStyle = '#222';
      ctx.fillText('Peak', lx + 28, legendY + 10);
      // Off-Peak
      lx += 70;
      ctx.fillStyle = '#444';
      ctx.fillRect(lx, legendY, 18, 10);
      ctx.fillStyle = '#222';
      ctx.fillText('Off-Peak', lx + 38, legendY + 10);
      ctx.restore();
      // Title
      ctx.font = 'bold 18px DM Sans, Arial, sans-serif';
      ctx.fillStyle = '#222';
      ctx.fillText('Consumption — Daily Breakdown', chartLeft + chartWidth / 2, chartTop - 40);
      // Convert to image
      const chartDataUrl = pdfChartCanvas.toDataURL('image/png');
      chartImgHtml = `<div style=\"margin:18px 0 18px 0;text-align:center;\"><img src=\"${chartDataUrl}\" style=\"max-width:100%;height:auto;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);\" alt=\"Consumption Chart\"></div>`;
    } catch (e) { /* ignore errors */ }

    // Only one PDF page should be generated
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
        ${chartImgHtml}
        <div class="pdf-section-title">
          <div class="l">${view === 'monthly' ? 'Monthly records' : 'Daily records'}</div>
          <div class="r">${dailyRowsForPrint.length} ${view === 'monthly' ? 'months' : 'days'}</div>
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
    const breakerName = document.getElementById('status-text').innerText = `${breaker.name}`;


    // Chart
    await ensureChart();
    const ctx = document.getElementById('rpt-chart').getContext('2d');
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    // For daily/monthly view we show the supplier's total consumption as a single column
    // (Peak + Off-Peak combined). For hourly view we keep separate Peak/Off-Peak bars.
    const datasets = [];
    if (view === 'daily' || view === 'monthly') {
      // combine peak + off into a single supplier series
      const chartSupplier = chartLabels.map((_, i) => {
        const pk = Number(chartPeak[i] || 0);
        const off = Number(chartOff[i] || 0);
        return pk + off;
      });
      datasets.push({ label: `${breakerName} — Supplier (total)`, data: chartSupplier, backgroundColor: 'rgba(121, 40, 40, 0.88)', borderRadius: 2, borderSkipped: false });
    } else {
      datasets.push({ label: `${breakerName} - Peak`, data: chartPeak, backgroundColor: 'rgba(255,0,15,0.85)', borderRadius: 2, borderSkipped: false });
      datasets.push({ label: `${breakerName} - Off-Peak`, data: chartOff, backgroundColor: 'rgba(0, 0, 0, 0.72)', borderRadius: 2, borderSkipped: false });
    }

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: { labels: chartLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'DM Sans', size: 12, weight: '800' }, boxWidth: 12, boxHeight: 12, padding: 16 } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y} kWh` } }
        },
        scales: {
          x: { stacked: (view !== 'hourly'), ticks: { font: { family: 'DM Mono', size: 9 }, maxRotation: 55, color: '#888' }, grid: { display: false } },
          y: { stacked: (view !== 'hourly'), title: { display: true, text: 'kWh', font: { family: 'DM Sans', size: 13 }, color: '#aaa' }, ticks: { font: { family: 'DM Mono', size: 11 }, color: '#888' }, grid: { color: '#f0f0f0' } }
        }
      }
    });

    setStatus('active', `Report ready — ${breaker.name} | ${view} view | ${from} → ${to} | PDF = clear rows`);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    console.error(e);
    setStatus('', `Error: ${e.message || e}`);
    noData.classList.add('visible');
  } finally {
    addCompareBreakerButtonAfterReport();
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

// Loading overlay helpers
function showLoadingOverlay() {
  const o = document.getElementById('loading-overlay'); if (o) o.classList.remove('hidden');
}
function hideLoadingOverlay() {
  const o = document.getElementById('loading-overlay'); if (o) o.classList.add('hidden');
}

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

// App initialization: load essential data and then hide the loading overlay
async function appInit() {
  showLoadingOverlay();
  setStatus('loading', 'Initializing...');
  try {
    await Promise.allSettled([
      loadBreakersAndFillSelect(),
      fillTariffSummaryBar(),
      updateAuthUi()
    ]);
  } finally {
    hideLoadingOverlay();
    setStatus('', 'Ready.');
    // show settings button if allowed
    try { showSettingButton(); } catch (e) { /* ignore */ }
  }
}

appInit();

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

// Show setting button
async function showSettingButton() {
  const settingsBtn = document.getElementById('btn-settings');
  const currentUser = await adjustUIForUserRole();
  if (currentUser === 'admin') {
    settingsBtn.style.visibility = 'visible';
  }
}
