import { fmtMoney, fmtKwh, gbDate, gbMonth, sortByTimestampAsc, seasonLabel } from "./format";

function aggregateToDaily(rows) {
  const map = new Map();
  rows.forEach(r => {
    const ts = String(r.timestamp || "");
    const date = ts.includes(" ") ? ts.split(" ")[0] : ts.slice(0, 10);
    if (!date) return;
    const pk = (r.type || "") === "Peak";
    const kwh = Number(r.kwh || 0);
    const amt = Number(r.amount || 0);
    if (!map.has(date)) map.set(date, { timestamp: date, peak_kwh: 0, off_kwh: 0, kwh: 0, amount: 0 });
    const b = map.get(date);
    b.kwh += kwh; b.amount += amt;
    if (pk) b.peak_kwh += kwh; else b.off_kwh += kwh;
  });
  return [...map.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function generatePDF({ data, breakerName, view, from, to }) {
  const rows = sortByTimestampAsc(Array.isArray(data?.rows) ? data.rows : []);
  const peakKwh   = Number(data?.peak_kwh    || 0);
  const offKwh    = Number(data?.offpeak_kwh  || 0);
  const totalKwh  = Number(data?.total_kwh    || 0);
  const peakAmt   = Number(data?.peak_amount  || 0);
  const offAmt    = Number(data?.offpeak_amount || 0);
  const grand     = Number(data?.total_amount  || 0);
  const invoiceNo = data?.invoice_no || "";
  const generated = String(data?.generated_at || new Date().toLocaleString("en-GB")).slice(0, 19);
  const seasons   = new Set(rows.map(r => r.season).filter(Boolean));
  const tariffText = seasons.size === 1 ? `ToU — ${seasonLabel([...seasons][0])} (Before VAT)` : "ToU — Seasonal (Before VAT)";

  const printRows = view === "hourly" ? aggregateToDaily(rows) : rows;

  const tableRows = printRows.map(r => {
    const ts  = String(r.timestamp || "");
    const lbl = view === "monthly" ? gbMonth(ts) : gbDate(ts);
    const pk  = Number(r.peak_kwh  || 0);
    const off = Number(r.off_kwh   || 0);
    const tot = Number(r.kwh       || 0);
    const amt = Number(r.amount    || 0);
    const type = pk > 0 && off === 0 ? "Peak" : pk === 0 ? "Off-Peak" : "Mixed";
    const typeColor = type === "Peak" ? "#CC0010" : type === "Off-Peak" ? "#2255bb" : "#555";
    return `
      <tr>
        <td>${lbl}</td>
        <td class="num">${fmtKwh(pk)}</td>
        <td class="num">${fmtKwh(off)}</td>
        <td class="num">${fmtKwh(tot)}</td>
        <td style="color:${typeColor};font-weight:500">${type}</td>
        <td class="num">${fmtMoney(amt)}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ABB Energy Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }

  .page { width: 210mm; min-height: 297mm; padding: 0; }

  /* Header */
  .header { background: #CC0010; padding: 22px 28px; display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { color: #fff; font-size: 32px; font-weight: 700; letter-spacing: 5px; line-height: 1; }
  .logo-sub { color: #fff; font-size: 9px; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px; }
  .doc-title { text-align: right; }
  .doc-type { color: #fff; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; }
  .doc-name { color: #fff; font-size: 16px; font-weight: 500; margin-top: 3px; }
  .inv-no { color: #fff; font-size: 10px; margin-top: 4px; font-family: monospace; }

  /* Meta bar */
  .meta-bar { background: #1a0002; display: flex; }
  .meta-cell { flex: 1; padding: 10px 16px; border-right: 0.5px solid rgba(255,255,255,0.07); }
  .meta-cell:last-child { border-right: none; }
  .meta-label { color: rgba(255,255,255,0.95); font-size: 8px; text-transform: uppercase; letter-spacing: 1.5px; }
  .meta-value { color: #fff; font-size: 11px; font-weight: 500; margin-top: 3px; font-family: monospace; }

  /* Summary */
  .summary { display: flex; border-bottom: 0.5px solid #eee; }
  .sum-cell { flex: 1; padding: 16px 18px; border-right: 0.5px solid #eee; text-align: center; }
  .sum-cell:last-child { border-right: none; background: #fff8f8; }
  .sum-label { font-size: 9px; color: #111; text-transform: uppercase; letter-spacing: 1.5px; }
  .sum-kwh { font-size: 20px; font-weight: 500; color: #111; margin-top: 5px; font-family: monospace; }
  .sum-ils { font-size: 10px; color: #111; margin-top: 3px; }
  .sum-cell.total .sum-kwh { color: #CC0010; font-size: 24px; }
  .sum-cell.total .sum-label { color: #CC0010; }

  /* VAT note */
  .vat-note { background: #fffbf0; border-left: 3px solid #f0a000; padding: 7px 16px; font-size: 10px; color: #5a3800; }

  /* Table */
  .section-label { font-size: 9px; color: #111; text-transform: uppercase; letter-spacing: 2px; padding: 14px 16px 6px; border-bottom: 0.5px solid #f0f0f0; font-weight: 700; color: #111; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 7px 14px; font-size: 9px; color: #111; text-transform: uppercase; letter-spacing: 1.5px; text-align: left; background: #f7f7f7; border-bottom: 0.5px solid #eee; font-weight: 500; }
  th.num, td.num { text-align: right; }
  td { padding: 8px 14px; border-bottom: 0.5px solid #f3f3f3; font-size: 11px; font-family: monospace; color: #111; }
  tr:nth-child(even) td { background: #fafafa; }
  .tr-total td { background: #fff0f0; font-weight: 600; border-top: 0.5px solid #ddd; }
  .tr-total td:last-child { color: #CC0010; }

  /* Footer */
  .footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: #f7f7f7; border-top: 0.5px solid #eee; margin-top: auto; }
  .footer-logo { font-size: 13px; font-weight: 700; color: #CC0010; letter-spacing: 3px; }
  .footer-text { font-size: 9px; color: #222; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; size: A4; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="logo">ABB</div>
      <div class="logo-sub">Energy Monitoring System</div>
    </div>
    <div class="doc-title">
      <div class="doc-type">Official Invoice</div>
      <div class="doc-name">Energy Consumption Report</div>
      <div class="inv-no">#${invoiceNo}</div>
    </div>
  </div>

  <div class="meta-bar">
    <div class="meta-cell"><div class="meta-label">Breaker</div><div class="meta-value">${breakerName}</div></div>
    <div class="meta-cell"><div class="meta-label">From</div><div class="meta-value">${from}</div></div>
    <div class="meta-cell"><div class="meta-label">To</div><div class="meta-value">${to}</div></div>
    <div class="meta-cell"><div class="meta-label">Tariff</div><div class="meta-value">${tariffText}</div></div>
    <div class="meta-cell"><div class="meta-label">Generated</div><div class="meta-value">${generated}</div></div>
  </div>

  <div class="summary">
    <div class="sum-cell">
      <div class="sum-label">Peak</div>
      <div class="sum-kwh">${fmtKwh(peakKwh)}</div>
      <div class="sum-ils">${fmtMoney(peakAmt)} ILS</div>
    </div>
    <div class="sum-cell">
      <div class="sum-label">Off-Peak</div>
      <div class="sum-kwh">${fmtKwh(offKwh)}</div>
      <div class="sum-ils">${fmtMoney(offAmt)} ILS</div>
    </div>
    <div class="sum-cell">
      <div class="sum-label">Total kWh</div>
      <div class="sum-kwh">${fmtKwh(totalKwh)}</div>
      <div class="sum-ils">Before VAT</div>
    </div>
    <div class="sum-cell total">
      <div class="sum-label">Total Due</div>
      <div class="sum-kwh">${fmtMoney(grand)}</div>
      <div class="sum-ils">ILS</div>
    </div>
  </div>

  <div class="vat-note">Prices before VAT — Seasonal Time-of-Use pricing (IEC regulations)</div>

  <div class="section-label">${view === "monthly" ? "Monthly" : "Daily"} breakdown</div>
  <table>
    <thead>
      <tr>
        <th>${view === "monthly" ? "Month" : "Date"}</th>
        <th class="num">Peak kWh</th>
        <th class="num">Off-Peak kWh</th>
        <th class="num">Total kWh</th>
        <th>Type</th>
        <th class="num">ILS</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="tr-total">
        <td>Total</td>
        <td class="num">${fmtKwh(peakKwh)}</td>
        <td class="num">${fmtKwh(offKwh)}</td>
        <td class="num">${fmtKwh(totalKwh)}</td>
        <td></td>
        <td class="num">${fmtMoney(grand)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <div style="display:flex;flex-direction:column;gap:3px">
      <div><span class="footer-logo">ABB</span> &nbsp;<span class="footer-text" style="font-weight:600">Energy Monitoring System &nbsp;|&nbsp; Energy Report v1.0</span></div>
      <div class="footer-text">IEC Time-of-Use pricing &nbsp;|&nbsp; All values before VAT &nbsp;|&nbsp; Seasonal tariff (Shoulder / Winter / Summer)</div>
    </div>
    <div style="text-align:right">
      <div class="footer-text" style="font-weight:600;color:#CC0010">Generated by ABB EMS</div>
      <div class="footer-text" style="margin-top:2px">${generated}</div>
    </div>
  </div>
</div>
<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  if (!win) alert("Please allow popups for this site to export PDF.");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}