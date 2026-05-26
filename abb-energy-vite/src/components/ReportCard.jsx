import { useEffect, useRef, useCallback } from "react";
import { generatePDF } from "../utils/generatePDF";
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { fmtMoney, fmtKwh, fmtRate, gbDate, gbStamp, gbMonth, shortDay, shortMonth, hhFromStamp, seasonLabel, sortByTimestampAsc } from "../utils/format";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const BREAKER_COLORS = ["#CC0010", "#2255bb", "#1a7f37", "#f0a000", "#7c3aed"];

// extraBreakers = [{id, name, color, data}]
export default function ReportCard({ data, breakerName, view, from, to, extraBreakers = [] }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const cardRef = useRef(null);

  const rows = sortByTimestampAsc(Array.isArray(data?.rows) ? data.rows : []);
  const peakKwh = Number(data?.peak_kwh || 0);
  const offKwh = Number(data?.offpeak_kwh || 0);
  const totalKwh = Number(data?.total_kwh || 0);
  const peakAmt = Number(data?.peak_amount || 0);
  const offAmt = Number(data?.offpeak_amount || 0);
  const grand = Number(data?.total_amount || 0);
  const invoiceNo = data?.invoice_no || "";
  const today = data?.generated_at || new Date().toLocaleString("en-GB");

  const seasons = new Set(rows.map((r) => r.season).filter(Boolean));
  const tariffText = seasons.size === 1 ? `ToU — ${seasonLabel([...seasons][0])} (Before VAT)` : "ToU — Seasonal (Before VAT)";

  // Build labels from main breaker
  function buildChartData(r_rows, color, name) {
    const labels = [], peak = [], off = [];
    r_rows.forEach((r) => {
      if (view === "monthly") { labels.push(shortMonth(r.timestamp)); peak.push(Number(r.peak_kwh || 0)); off.push(Number(r.off_kwh || 0)); }
      else if (view === "daily") { labels.push(shortDay(r.timestamp)); peak.push(Number(r.peak_kwh || 0)); off.push(Number(r.off_kwh || 0)); }
      else { const pk = (r.type || "") === "Peak"; labels.push(hhFromStamp(r.timestamp)); peak.push(pk ? Number(r.kwh || 0) : 0); off.push(pk ? 0 : Number(r.kwh || 0)); }
    });
    return { labels, peak, off };
  }

  const mainChart = buildChartData(rows, BREAKER_COLORS[0], breakerName);
  const labels = mainChart.labels;

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
    const ctx = chartRef.current.getContext("2d");
    const isHourly = view === "hourly";
    const hasExtra = extraBreakers.length > 0;

    let datasets = [];

    if (hasExtra) {
      // Multi-breaker mode — one dataset per breaker, total kWh, grouped bars
      const allBreakers = [
        { name: breakerName, color: BREAKER_COLORS[0], rows },
        ...extraBreakers.filter(b => b.data).map((b, i) => ({
          name: b.name,
          color: b.color || BREAKER_COLORS[i + 1],
          rows: sortByTimestampAsc(Array.isArray(b.data?.rows) ? b.data.rows : []),
        })),
      ];

      datasets = allBreakers.map(b => {
        const c = buildChartData(b.rows, b.color, b.name);
        const totals = c.labels.map((_, i) => (c.peak[i] || 0) + (c.off[i] || 0));
        // Align to main labels
        const aligned = labels.map((lbl, i) => {
          const idx = c.labels.indexOf(lbl);
          return idx >= 0 ? totals[idx] : 0;
        });
        return {
          label: b.name,
          data: aligned,
          backgroundColor: b.color + "cc",
          borderColor: b.color,
          borderWidth: 1,
          borderRadius: 2,
          borderSkipped: false,
        };
      });
    } else if (isHourly) {
      datasets = [
        { label: `${breakerName} - Peak`, data: mainChart.peak, backgroundColor: "rgba(255,0,15,0.85)", borderRadius: 2, borderSkipped: false },
        { label: `${breakerName} - Off-Peak`, data: mainChart.off, backgroundColor: "rgba(100,140,200,0.75)", borderRadius: 2, borderSkipped: false },
      ];
    } else {
      datasets = [
        { label: `${breakerName} — Total`, data: labels.map((_, i) => mainChart.peak[i] + mainChart.off[i]), backgroundColor: "rgba(204,0,16,0.85)", borderRadius: 2, borderSkipped: false },
      ];
    }

    chartInstance.current = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", labels: { font: { size: 12, weight: "500" }, color: "#aaa", boxWidth: 12, boxHeight: 12, padding: 16 } },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y} kWh` } },
        },
        scales: {
          x: { stacked: !hasExtra && !isHourly, ticks: { font: { size: 9 }, maxRotation: 55, color: "#888" }, grid: { display: false } },
          y: { stacked: !hasExtra && !isHourly, title: { display: true, text: "kWh", font: { size: 13 }, color: "#aaa" }, ticks: { font: { size: 11 }, color: "#888" }, grid: { color: "rgba(255,255,255,0.06)" } },
        },
      },
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [rows.length, view, breakerName, JSON.stringify(extraBreakers.map(b => b.data?.total_kwh))]); // eslint-disable-line

  const exportPDF = useCallback(async () => {
    const btn = document.getElementById("pdf-export-btn");
    if (btn) { btn.textContent = "Generating..."; btn.disabled = true; }
    try { await generatePDF({ data, breakerName, view, from, to }); }
    catch (e) { console.error("PDF export failed:", e); alert("PDF export failed: " + e.message); }
    finally { if (btn) { btn.textContent = "↓ Export PDF"; btn.disabled = false; } }
  }, [data, breakerName, view, from, to]);

  const tableRows = rows.map((r, i) => {
    if (view === "monthly") return <tr key={i}><td>{gbMonth(r.timestamp)}</td><td><span className="tag pk">Pk: {fmtKwh(r.peak_kwh)}</span> <span className="tag op">Off: {fmtKwh(r.off_kwh)}</span></td><td className="n">{fmtKwh(r.kwh)}</td><td className="n">Monthly</td><td className="n">{fmtMoney(r.amount)}</td></tr>;
    if (view === "daily") return <tr key={i}><td>{gbDate(r.timestamp)}</td><td><span className="tag pk">Pk: {fmtKwh(r.peak_kwh)}</span> <span className="tag op">Off: {fmtKwh(r.off_kwh)}</span></td><td className="n">{fmtKwh(r.kwh)}</td><td className="n">Mixed</td><td className="n">{fmtMoney(r.amount)}</td></tr>;
    const pk = (r.type || "") === "Peak";
    return <tr key={i} className={pk ? "pk-row" : ""}><td>{gbStamp(r.timestamp)}</td><td><span className={`tag ${pk ? "pk" : "op"}`}>{pk ? "Peak" : "Off-Peak"}</span></td><td className="n">{fmtKwh(r.kwh)}</td><td className="n">{fmtRate(r.rate)}</td><td className="n">{fmtMoney(r.amount)}</td></tr>;
  });

  // Extra breaker detailed rows in table
  const extraTableSections = extraBreakers.filter(b => b.data).map((b) => {
    const bRows = sortByTimestampAsc(Array.isArray(b.data?.rows) ? b.data.rows : []);
    return { b, bRows };
  });

  return (
    <div className="report-card visible">
      <div ref={cardRef}>
        <div className="rpt-header">
          <div className="rpt-logo">
            <svg width="86" height="28" viewBox="0 0 86 28" xmlns="http://www.w3.org/2000/svg">
              <text x="0" y="20" fontFamily="Inter, Arial, sans-serif" fontWeight="500" fontSize="20" fill="#FFFFFF">ABB</text>
            </svg>
          </div>
          <div className="rpt-header-right">
            <div className="rpt-type">Energy Report — {view === "hourly" ? "Hourly" : view === "daily" ? "Daily" : "Monthly"} View {extraBreakers.length > 0 ? `· ${extraBreakers.length + 1} Breakers` : ""}</div>
            <div className="rpt-name">{breakerName}{extraBreakers.length > 0 ? ` + ${extraBreakers.length} more` : ""}</div>
          </div>
        </div>
        <div className="rpt-subbar">
          <span className="sl">Breaker Energy Invoice</span>
          <span className="sr">#{invoiceNo} &nbsp;|&nbsp; {String(today)}</span>
        </div>
        <div className="rpt-meta">
          <div className="rpt-meta-cell"><div className="ml">From</div><div className="mv">{from}</div></div>
          <div className="rpt-meta-cell"><div className="ml">To</div><div className="mv">{to}</div></div>
          <div className="rpt-meta-cell"><div className="ml">Tariff</div><div className="mv">{tariffText}</div></div>
          <div className="rpt-meta-cell"><div className="ml">Total</div><div className="mv">{fmtKwh(totalKwh)} kWh</div></div>
        </div>

        {/* Breaker color legend if multi */}
        {extraBreakers.length > 0 && (
          <div style={{display:"flex",gap:12,padding:"8px 16px",background:"#0a0b0d",borderBottom:"0.5px solid #1e2025",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
              <span style={{width:10,height:10,borderRadius:2,background:BREAKER_COLORS[0],display:"inline-block"}}/>
              <span style={{color:"#ccc"}}>{breakerName}</span>
            </div>
            {extraBreakers.map((b,i) => (
              <div key={b.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                <span style={{width:10,height:10,borderRadius:2,background:b.color,display:"inline-block"}}/>
                <span style={{color:"#ccc"}}>{b.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rpt-body">
          <div className="rpt-chart-panel">
            <div className="rpt-chart-title">▲ Consumption — {view === "hourly" ? "Hourly Breakdown" : view === "daily" ? "Daily Summary" : "Monthly Summary"}</div>
            <div className="chart-container"><canvas ref={chartRef} /></div>
            <div className="chart-pills">
              <div className="pill pk"><div className="pl">Peak Hours</div><div className="pv">{fmtKwh(peakKwh)} kWh</div><div className="ps">{fmtMoney(peakAmt)} ILS</div></div>
              <div className="pill op"><div className="pl">Off-Peak Hours</div><div className="pv">{fmtKwh(offKwh)} kWh</div><div className="ps">{fmtMoney(offAmt)} ILS</div></div>
              <div className="pill total"><div className="pl">Total kWh</div><div className="pv">{fmtKwh(totalKwh)} kWh</div><div className="ps">{fmtMoney(grand)} ILS</div></div>
            </div>
          </div>
          <div className="rpt-table-panel">
            <div className="rpt-table-wrap" style={{ paddingTop: 16 }}>
              <table className="rpt-table">
                <thead><tr><th>{view === "hourly" ? "Time" : "Date"}</th><th>Type</th><th>kWh</th><th>Rate</th><th>ILS</th></tr></thead>
                <tbody>
                  {tableRows}
                  {extraTableSections.map(({ b, bRows }) => (
                    <>
                      <tr key={`hdr-${b.id}`}>
                        <td colSpan={5} style={{padding:"6px 8px 4px",fontSize:10,color:b.color,borderTop:"1px solid #1e2025",fontWeight:600,borderLeft:`3px solid ${b.color}`}}>
                          ■ {b.name} — {fmtKwh(b.data.total_kwh)} kWh · {fmtMoney(b.data.total_amount)} ILS
                        </td>
                      </tr>
                      {bRows.map((r, i) => {
                        if (view === "monthly") return <tr key={i} style={{borderLeft:`2px solid ${b.color}22`}}><td style={{color:"#888"}}>{gbMonth(r.timestamp)}</td><td><span className="tag pk">Pk: {fmtKwh(r.peak_kwh)}</span> <span className="tag op">Off: {fmtKwh(r.off_kwh)}</span></td><td className="n">{fmtKwh(r.kwh)}</td><td className="n">Monthly</td><td className="n" style={{color:b.color}}>{fmtMoney(r.amount)}</td></tr>;
                        if (view === "daily") return <tr key={i} style={{borderLeft:`2px solid ${b.color}44`}}><td style={{color:"#888"}}>{gbDate(r.timestamp)}</td><td><span className="tag pk">Pk: {fmtKwh(r.peak_kwh)}</span> <span className="tag op">Off: {fmtKwh(r.off_kwh)}</span></td><td className="n">{fmtKwh(r.kwh)}</td><td className="n">Mixed</td><td className="n" style={{color:b.color}}>{fmtMoney(r.amount)}</td></tr>;
                        const pk = (r.type || "") === "Peak";
                        return <tr key={i} style={{borderLeft:`2px solid ${b.color}44`}} className={pk ? "pk-row" : ""}><td style={{color:"#888"}}>{gbStamp(r.timestamp)}</td><td><span className={`tag ${pk?"pk":"op"}`}>{pk?"Peak":"Off-Peak"}</span></td><td className="n">{fmtKwh(r.kwh)}</td><td className="n">{fmtRate(r.rate)}</td><td className="n" style={{color:b.color}}>{fmtMoney(r.amount)}</td></tr>;
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="rpt-totals">
          <div>
            <div className="rpt-tot-lines">
              <div className="rpt-tot-line-peak"><span>■ Peak — {fmtKwh(peakKwh)} kWh</span><span className="tv">{fmtMoney(peakAmt)} ILS</span></div>
              <div className="rpt-tot-line-off"><span>■ Off-Peak — {fmtKwh(offKwh)} kWh</span><span className="tv">{fmtMoney(offAmt)} ILS</span></div>
              <div className="rpt-tot-line-total"><span>■ Total — {fmtKwh(totalKwh)} kWh</span><span className="tv">{fmtMoney(grand)} ILS</span></div>
            </div>
            <div className="rpt-note">Tariffs are BEFORE VAT — seasonal ToU pricing (IEC)</div>
          </div>
          <div className="rpt-total-box">
            <div className="tbl">Total Due</div>
            <div className="tba">{fmtMoney(grand)}</div>
            <div className="tbc">ILS</div>
          </div>
        </div>
      </div>
      <div className="rpt-export-bar">
        <button id="pdf-export-btn" className="btn-export-pdf" onClick={exportPDF}>↓ Export PDF</button>
      </div>
    </div>
  );
}