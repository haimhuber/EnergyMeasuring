import { useState, useEffect, useCallback } from "react";
import { api } from "../api/api";
import Navbar from "../components/Navbar";
import "./DashboardOverview.css";



const PERIOD_OPTIONS = [
  { label: "Today",     value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This week", value: "week" },
  { label: "This month",value: "month" },
];

function getDateRange(period) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  if (period === "today") {
    const t = fmt(now); return { from: t, to: t };
  }
  if (period === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate()-1); const s = fmt(y); return { from: s, to: s };
  }
  if (period === "week") {
    const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return { from: fmt(s), to: fmt(now) };
  }
  if (period === "month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1); return { from: fmt(s), to: fmt(now) };
  }
  return { from: fmt(now), to: fmt(now) };
}

function fmt(n) { return Number(n||0).toLocaleString(undefined, {maximumFractionDigits:1}); }
function fmtIls(n) { return Number(n||0).toFixed(0); }

const PIE_COLORS = [
  "#CC0010","#e84b57","#2255bb","#4488ee","#1a7f37","#33aa55",
  "#f0a000","#ffcc44","#7c3aed","#a78bfa","#0891b2","#22d3ee",
  "#dc2626","#16a34a","#d97706","#7c3aed","#db2777","#0369a1",
  "#065f46","#92400e","#1e3a8a","#3f6212","#7f1d1d","#134e4a",
  "#1e1b4b","#713f12","#4a044e",
];

// Main breakers — one per panel group
const MAIN_BREAKERS = [
  { id: "1",  name: "Q0 Main Breaker", group: "B0",   displayName: "B0 — Main" },
  { id: "22", name: "Q0 Main Breaker", group: "Roof",  displayName: "Roof — Main" },
  { id: "27", name: "Q0 Main Breaker", group: "PB",    displayName: "PB — Main" },
  { id: "28", name: "Q0 Main Breaker", group: "PB1",   displayName: "PB1 — Main" },
];

// All breakers for drill-down
const GROUP_BREAKERS = {
  "B0":  ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","30"],
  "Roof":["22","23","24","25","26"],
  "PB":  ["27"],
  "PB1": ["28","29"],
};

function parseBreakers(list) {
  return (Array.isArray(list) ? list : []).map(text => {
    const str = String(text).trim();
    const parts = str.split(" - ");
    const id = parts[0]?.trim();
    const rest = parts.slice(1).join(" - ").trim();
    const groupMatch = rest.match(/^(B0|Roof|PB 1|PB)\s*-\s*/i);
    const group = groupMatch ? groupMatch[1].replace(" ","") : "B0";
    const name = groupMatch ? rest.slice(groupMatch[0].length) : rest;
    return { id, name: name || `Breaker ${id}`, group };
  }).filter(b => b.id);
}

export default function DashboardOverview() {
  const [period, setPeriod] = useState("today");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [breakers, setBreakers] = useState([]);
  const [drillGroup, setDrillGroup] = useState(null); // null = main view
  const [drillData, setDrillData] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    api.breakers().then(list => setBreakers(parseBreakers(list))).catch(() => {});
  }, []);

  const fetchAll = useCallback(async (p) => {
    setLoading(true);
    setData([]);
    setProgress(0);
    const { from, to } = getDateRange(p);

    // Fetch only 4 main breakers in parallel
    const settled = await Promise.allSettled(
      MAIN_BREAKERS.map(b => api.consumption(b.id, from, to, "daily"))
    );
    const results = settled.map((res, j) => {
      const b = MAIN_BREAKERS[j];
      if (res.status === "fulfilled") {
        const d = res.value;
        return { ...b, kwh: d.total_kwh||0, ils: d.total_amount||0, peak_kwh: d.peak_kwh||0, off_kwh: d.offpeak_kwh||0 };
      }
      return { ...b, kwh: 0, ils: 0, peak_kwh: 0, off_kwh: 0 };
    });
    setProgress(100);
    setData(results);
    setLoading(false);
  }, []);

  // Drill-down: fetch all breakers in a group
  const fetchDrillDown = useCallback(async (group) => {
    setDrillGroup(group);
    setDrillLoading(true);
    setDrillData([]);
    const { from, to } = getDateRange(period);
    const ids = GROUP_BREAKERS[group] || [];
    const allBreakers = breakers.filter(b => ids.includes(b.id));
    const settled = await Promise.allSettled(
      allBreakers.map(b => api.consumption(b.id, from, to, "daily"))
    );
    const results = settled.map((res, j) => {
      const b = allBreakers[j];
      if (res.status === "fulfilled") {
        const d = res.value;
        return { ...b, kwh: d.total_kwh||0, ils: d.total_amount||0, peak_kwh: d.peak_kwh||0, off_kwh: d.offpeak_kwh||0 };
      }
      return { ...b, kwh: 0, ils: 0, peak_kwh: 0, off_kwh: 0 };
    });
    setDrillData(results.sort((a,b) => b.kwh - a.kwh));
    setDrillLoading(false);
  }, [period, breakers]);

  useEffect(() => { fetchAll(period); }, [period, fetchAll]);

  const totalKwh  = data.reduce((s,r) => s + r.kwh, 0);
  const totalIls  = data.reduce((s,r) => s + r.ils, 0);
  const totalPeak = data.reduce((s,r) => s + r.peak_kwh, 0);
  const totalOff  = data.reduce((s,r) => s + r.off_kwh, 0);
  const peakPct   = totalKwh > 0 ? Math.round((totalPeak/totalKwh)*100) : 0;

  const sorted    = [...data].sort((a,b) => b.kwh - a.kwh);
  const top5      = sorted.slice(0, 5);
  const pieData   = sorted.filter(r => r.kwh > 0);

  // SVG Pie chart
  const PIE_R = 80, PIE_CX = 100, PIE_CY = 100;
  let pieSlices = [];
  if (pieData.length > 0) {
    let startAngle = -Math.PI / 2;
    pieData.forEach((r, i) => {
      const pct = r.kwh / totalKwh;
      const angle = pct * 2 * Math.PI;
      const x1 = PIE_CX + PIE_R * Math.cos(startAngle);
      const y1 = PIE_CY + PIE_R * Math.sin(startAngle);
      const x2 = PIE_CX + PIE_R * Math.cos(startAngle + angle);
      const y2 = PIE_CY + PIE_R * Math.sin(startAngle + angle);
      const large = angle > Math.PI ? 1 : 0;
      pieSlices.push({ r, i, x1, y1, x2, y2, large, startAngle, angle, pct, color: PIE_COLORS[i % PIE_COLORS.length] });
      startAngle += angle;
    });
  }

  // 7-day trend (use daily totals from today going back)
  const trendLabels = Array.from({length:7},(_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-(6-i));
    return `${d.getDate()}/${d.getMonth()+1}`;
  });

  // Group bar chart data
  const groups = ["B0","Roof","PB","PB1"];
  const groupTotals = groups.map(g => ({
    group: g,
    kwh: data.filter(r=>r.group===g).reduce((s,r)=>s+r.kwh,0)
  }));
  const maxGroup = Math.max(...groupTotals.map(g=>g.kwh), 1);

  return (
    <>
      <Navbar />
      <div className="dov-page">

        {/* Period selector */}
        <div className="dov-topbar">
          <div className="dov-title">
            <span className="dov-label">Energy Dashboard</span>
            <span className="dov-sub">Live consumption overview</span>
          </div>
          <div className="dov-period-btns">
            {PERIOD_OPTIONS.map(o => (
              <button key={o.value} className={`dov-period-btn${period===o.value?" active":""}`}
                onClick={()=>setPeriod(o.value)}>{o.label}</button>
            ))}
            <button className="dov-refresh-btn" onClick={()=>fetchAll(period)} title="Refresh">↻</button>
          </div>
        </div>

        {/* Loading bar */}
        {loading && (
          <div className="dov-progress-wrap">
            <div className="dov-progress-bar" style={{width:`${progress}%`}}/>
            <span className="dov-progress-text">Loading {progress}%</span>
          </div>
        )}

        {/* KPI cards */}
        <div className="dov-kpi-row">
          <div className="dov-kpi-card">
            <div className="dov-kpi-icon" style={{background:"rgba(204,0,16,0.12)",color:"#CC0010"}}>⚡</div>
            <div>
              <div className="dov-kpi-label">Total consumption</div>
              <div className="dov-kpi-value">{fmt(totalKwh)} <span className="dov-kpi-unit">kWh</span></div>
            </div>
          </div>
          <div className="dov-kpi-card">
            <div className="dov-kpi-icon" style={{background:"rgba(26,127,55,0.12)",color:"#1a7f37"}}>₪</div>
            <div>
              <div className="dov-kpi-label">Total cost</div>
              <div className="dov-kpi-value">{fmtIls(totalIls)} <span className="dov-kpi-unit">ILS</span></div>
            </div>
          </div>
          <div className="dov-kpi-card">
            <div className="dov-kpi-icon" style={{background:"rgba(204,0,16,0.12)",color:"#CC0010"}}>▲</div>
            <div>
              <div className="dov-kpi-label">Peak hours</div>
              <div className="dov-kpi-value">{fmt(totalPeak)} <span className="dov-kpi-unit">kWh ({peakPct}%)</span></div>
            </div>
          </div>
          <div className="dov-kpi-card">
            <div className="dov-kpi-icon" style={{background:"rgba(34,85,187,0.12)",color:"#2255bb"}}>▽</div>
            <div>
              <div className="dov-kpi-label">Off-peak hours</div>
              <div className="dov-kpi-value">{fmt(totalOff)} <span className="dov-kpi-unit">kWh ({100-peakPct}%)</span></div>
            </div>
          </div>
          <div className="dov-kpi-card">
            <div className="dov-kpi-icon" style={{background:"rgba(240,160,0,0.12)",color:"#f0a000"}}>◈</div>
            <div>
              <div className="dov-kpi-label">Active breakers</div>
              <div className="dov-kpi-value">{data.filter(r=>r.kwh>0).length} <span className="dov-kpi-unit">/ 4 panels</span></div>
            </div>
          </div>
        </div>

        <div className="dov-main-grid">

          {/* Pie chart */}
          <div className="dov-card dov-pie-card">
            <div className="dov-card-title">Consumption by breaker</div>
            <div className="dov-pie-wrap">
              <svg viewBox="0 0 200 200" width="180" height="180">
                {pieSlices.length === 0 && <circle cx={PIE_CX} cy={PIE_CY} r={PIE_R} fill="#1e2025"/>}
                {pieSlices.map((s,i) => (
                  pieSlices.length === 1
                    ? <circle key={i} cx={PIE_CX} cy={PIE_CY} r={PIE_R} fill={s.color}/>
                    : <path key={i}
                        d={`M${PIE_CX},${PIE_CY} L${s.x1},${s.y1} A${PIE_R},${PIE_R} 0 ${s.large},1 ${s.x2},${s.y2} Z`}
                        fill={s.color} stroke="#111317" strokeWidth="1.5"/>
                ))}
                <circle cx={PIE_CX} cy={PIE_CY} r={46} fill="#111317"/>
                <text x={PIE_CX} y={PIE_CY-6} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="500">{fmt(totalKwh)}</text>
                <text x={PIE_CX} y={PIE_CY+10} textAnchor="middle" fill="#888" fontSize="9">kWh total</text>
              </svg>
              <div className="dov-pie-legend">
                {pieData.slice(0,10).map((r,i) => (
                  <div key={r.id} className="dov-legend-item">
                    <span className="dov-legend-dot" style={{background:PIE_COLORS[i%PIE_COLORS.length]}}/>
                    <span className="dov-legend-name">{r.displayName || r.name}</span>
                    <span className="dov-legend-val">{Math.round((r.kwh/totalKwh)*100)}%</span>
                  </div>
                ))}
                {pieData.length > 10 && <div className="dov-legend-more">+{pieData.length-10} more</div>}
              </div>
            </div>
          </div>

          {/* Top consumers */}
          <div className="dov-card dov-top-card">
            <div className="dov-card-title">Top consumers</div>
            <div className="dov-top-list">
              {top5.map((r,i) => {
                const pct = totalKwh > 0 ? (r.kwh/totalKwh)*100 : 0;
                return (
                  <div key={r.id} className="dov-top-item">
                    <div className="dov-top-rank" style={{color: i===0?"#CC0010":i===1?"#f0a000":"#888"}}>{i+1}</div>
                    <div className="dov-top-info">
                      <div className="dov-top-name">{r.displayName || `${r.group} — ${r.name}`}</div>
                      <div className="dov-top-bar-wrap">
                        <div className="dov-top-bar" style={{width:`${pct}%`, background: PIE_COLORS[i]}}/>
                      </div>
                    </div>
                    <div className="dov-top-nums">
                      <div className="dov-top-kwh">{fmt(r.kwh)} kWh</div>
                      <div className="dov-top-ils">{fmtIls(r.ils)} ILS</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group bar chart */}
          <div className="dov-card dov-group-card">
            <div className="dov-card-title">By panel group</div>
            <div className="dov-group-bars">
              {groupTotals.map((g,i) => {
                const h = Math.max(4, (g.kwh/maxGroup)*120);
                return (
                  <div key={g.group} className="dov-group-bar-item" onClick={() => fetchDrillDown(g.group)} style={{cursor:"pointer"}} title={`Click to see ${g.group} details`}>
                    <div className="dov-group-bar-val">{fmt(g.kwh)}</div>
                    <div className="dov-group-bar-wrap">
                      <div className="dov-group-bar" style={{height:`${h}px`, background:PIE_COLORS[i*3]}}/>
                    </div>
                    <div className="dov-group-bar-label">{g.group}</div>
                    <div style={{fontSize:9,color:"#555",marginTop:2}}>▼ details</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Peak vs Off-Peak donut */}
          <div className="dov-card dov-split-card">
            <div className="dov-card-title">Peak vs Off-Peak split</div>
            <div className="dov-split-wrap">
              {(() => {
                const total = totalPeak + totalOff || 1;
                const pkPct = (totalPeak/total)*100;
                const offPct = (totalOff/total)*100;
                const r = 60, cx = 80, cy = 80;
                const circ = 2*Math.PI*r;
                const pkDash = (pkPct/100)*circ;
                const offDash = (offPct/100)*circ;
                return (
                  <svg viewBox="0 0 160 160" width="150" height="150">
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2025" strokeWidth="18"/>
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2255bb" strokeWidth="18"
                      strokeDasharray={`${offDash} ${circ}`} strokeDashoffset={circ*0.25} strokeLinecap="round"/>
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#CC0010" strokeWidth="18"
                      strokeDasharray={`${pkDash} ${circ}`} strokeDashoffset={circ*0.25 - offDash} strokeLinecap="round"/>
                    <text x={cx} y={cy-6} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="500">{Math.round(pkPct)}%</text>
                    <text x={cx} y={cy+10} textAnchor="middle" fill="#888" fontSize="8">peak</text>
                  </svg>
                );
              })()}
              <div className="dov-split-legend">
                <div className="dov-split-item">
                  <span className="dov-split-dot" style={{background:"#CC0010"}}/>
                  <div>
                    <div className="dov-split-label">Peak</div>
                    <div className="dov-split-val">{fmt(totalPeak)} kWh</div>
                  </div>
                </div>
                <div className="dov-split-item">
                  <span className="dov-split-dot" style={{background:"#2255bb"}}/>
                  <div>
                    <div className="dov-split-label">Off-Peak</div>
                    <div className="dov-split-val">{fmt(totalOff)} kWh</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Drill-down panel */}
        {drillGroup && (
          <div className="dov-card dov-table-card" style={{marginBottom:16}}>
            <div className="dov-card-title" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Panel {drillGroup} — All breakers</span>
              <button onClick={() => setDrillGroup(null)} style={{background:"none",border:"0.5px solid #333",color:"#888",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11}}>✕ Close</button>
            </div>
            {drillLoading ? <div style={{padding:20,color:"#555"}}>Loading...</div> : (
              <div className="dov-table-wrap">
                <table className="dov-table">
                  <thead><tr><th>#</th><th>Breaker</th><th className="n">kWh</th><th className="n">Peak kWh</th><th className="n">Off-Peak kWh</th><th className="n">ILS</th></tr></thead>
                  <tbody>
                    {drillData.map((r,i) => (
                      <tr key={r.id} className={r.kwh===0?"dov-row-zero":""}>
                        <td className="dov-rank-cell">{i+1}</td>
                        <td>{r.name}</td>
                        <td className="n">{fmt(r.kwh)}</td>
                        <td className="n" style={{color:"#CC0010"}}>{fmt(r.peak_kwh)}</td>
                        <td className="n" style={{color:"rgba(100,140,200,0.9)"}}>{fmt(r.off_kwh)}</td>
                        <td className="n">{fmtIls(r.ils)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Full breakers table */}
        <div className="dov-card dov-table-card">
          <div className="dov-card-title">Main Panels — {PERIOD_OPTIONS.find(o=>o.value===period)?.label}</div>
          <div className="dov-table-wrap">
            <table className="dov-table">
              <thead>
                <tr>
                  <th>#</th><th>Panel</th><th>Breaker</th>
                  <th className="n">kWh</th><th className="n">Peak kWh</th>
                  <th className="n">Off-Peak kWh</th><th className="n">ILS</th>
                  <th className="n">Share</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r,i) => {
                  const pct = totalKwh > 0 ? (r.kwh/totalKwh)*100 : 0;
                  return (
                    <tr key={r.id} className={r.kwh===0?"dov-row-zero":""}>
                      <td className="dov-rank-cell">{i+1}</td>
                      <td><span className="dov-group-badge" style={{background: r.group==="Roof"?"rgba(240,160,0,0.15)":r.group.startsWith("PB")?"rgba(34,85,187,0.15)":"rgba(204,0,16,0.12)"}}>{r.group}</span></td>
                      <td>{r.name}</td>
                      <td className="n">{fmt(r.kwh)}</td>
                      <td className="n" style={{color:"#CC0010"}}>{fmt(r.peak_kwh)}</td>
                      <td className="n" style={{color:"#2255bb"}}>{fmt(r.off_kwh)}</td>
                      <td className="n">{fmtIls(r.ils)}</td>
                      <td className="n">
                        <div className="dov-share-wrap">
                          <div className="dov-share-bar" style={{width:`${Math.min(pct,100)}%`}}/>
                          <span>{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}