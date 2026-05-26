import { useState, useEffect, useCallback } from "react";
import { api } from "../api/api";
import Navbar from "../components/Navbar";
import AIChat from "../components/AIChat";
import SettingsModal from "../components/SettingsModal";
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

// Main breakers — one per panel group (without PB1)
const MAIN_BREAKERS = [
  { id: "1",  name: "Q0 Main Breaker", group: "B0",   displayName: "B0 — Main" },
  { id: "22", name: "Q0 Main Breaker", group: "Roof",  displayName: "Roof — Main" },
  { id: "27", name: "Q0 Main Breaker", group: "PB",    displayName: "PB — Main" },
  { id: "30", name: "PV Panels",       group: "PV",    displayName: "PV Panels" },
];

// Charging stations (PB1)
const CHARGING_BREAKERS = [
  { id: "28", name: "Q0 Main Breaker", group: "PB1", displayName: "PB1 — Main" },
  { id: "29", name: "Q1 AC Charges",   group: "PB1", displayName: "PB1 — AC Charges" },
];

// All breakers for drill-down
const GROUP_BREAKERS = {
  "B0":  ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21"],
  "Roof":["22","23","24","25","26"],
  "PB":  ["27"],
  "PB1": ["28","29"],
  "PV":  ["30"],
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
  const [viewMode, setViewMode] = useState("main");
  const [chargingData, setChargingData] = useState([]); // "main" | "charging"
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [drillGroup, setDrillGroup] = useState(null);
  const [efficiency, setEfficiency] = useState({ yesterday: null, lastWeek: null, loading: true }); // null = main view
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

    // Fetch breakers based on viewMode
    const breakerList = viewMode === "charging" ? CHARGING_BREAKERS : MAIN_BREAKERS;
    const settled = await Promise.allSettled(
      breakerList.map(b => api.consumption(b.id, from, to, "daily"))
    );
    const results = settled.map((res, j) => {
      const b = breakerList[j];
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

  useEffect(() => { fetchAll(period); }, [period, fetchAll, viewMode]);

  // Auto-refresh at the top of every hour
  useEffect(() => {
    function scheduleRefresh() {
      const now = new Date();
      const msUntilNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();
      return setTimeout(() => {
        fetchAll(period);
        // Schedule next refresh
        const interval = setInterval(() => fetchAll(period), 60 * 60 * 1000);
        return () => clearInterval(interval);
      }, msUntilNextHour);
    }
    const timer = scheduleRefresh();
    return () => clearTimeout(timer);
  }, [period, fetchAll]);

  useEffect(() => {
    async function fetchCharging() {
      const { from, to } = getDateRange(period);
      const settled = await Promise.allSettled(
        CHARGING_BREAKERS.map(b => api.consumption(b.id, from, to, "daily"))
      );
      const results = settled.map((res, j) => {
        const b = CHARGING_BREAKERS[j];
        if (res.status === "fulfilled") {
          const d = res.value;
          return { ...b, kwh: d.total_kwh||0, ils: d.total_amount||0, peak_kwh: d.peak_kwh||0, off_kwh: d.offpeak_kwh||0 };
        }
        return { ...b, kwh: 0, ils: 0, peak_kwh: 0, off_kwh: 0 };
      });
      setChargingData(results);
    }
    fetchCharging();
  }, [period]);

  useEffect(() => {
    async function fetchEfficiency() {
      setEfficiency(e => ({ ...e, loading: true }));
      const now = new Date();
      const fmtDate = (d) => { const p=(n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
      const currentHour = now.getHours(); // e.g. 17

      const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
      const lastWeek  = new Date(now); lastWeek.setDate(now.getDate()-7);
      const todayStr = fmtDate(now), yStr = fmtDate(yesterday), lwStr = fmtDate(lastWeek);

      // Fetch hourly data and sum only up to currentHour
      async function getKwhUpToHour(dateStr) {
        try {
          const settled = await Promise.allSettled(
            MAIN_BREAKERS.map(b => api.consumption(b.id, dateStr, dateStr, "hourly"))
          );
          let total = 0;
          for (const res of settled) {
            if (res.status !== "fulfilled") continue;
            const rows = res.value.rows || [];
            for (const row of rows) {
              const rowHour = new Date(row.timestamp + ":00").getHours();
              if (rowHour <= currentHour) total += row.kwh || 0;
            }
          }
          return total;
        } catch { return null; }
      }

      const [todayKwh, yKwh, lwKwh] = await Promise.all([
        getKwhUpToHour(todayStr),
        getKwhUpToHour(yStr),
        getKwhUpToHour(lwStr),
      ]);

      const calcPct = (curr, prev) => prev && prev > 0 ? ((curr - prev) / prev) * 100 : null;

      setEfficiency({
        loading: false,
        yesterday: calcPct(todayKwh, yKwh),
        lastWeek:  calcPct(todayKwh, lwKwh),
        todayKwh, yKwh, lwKwh,
        currentHour,
      });
    }
    fetchEfficiency();
  }, []);

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
  const groups = viewMode==="charging" ? ["PB1"] : ["B0","Roof","PB","PV"];
  const groupTotals = groups.map(g => ({
    group: g,
    kwh: data.filter(r=>r.group===g).reduce((s,r)=>s+r.kwh,0)
  }));
  const maxGroup = Math.max(...groupTotals.map(g=>g.kwh), 1);

  return (
    <>
      <Navbar onOpenChat={() => setShowChat(true)} onOpenSettings={() => setShowSettings(true)} />
      <div className="dov-page">

        {/* Period selector */}
        <div className="dov-topbar">
          <div className="dov-title">
            <span className="dov-label">Energy Dashboard</span>
            <span className="dov-sub">Live consumption overview</span>
          </div>
          <div className="dov-period-btns">
            <div className="dov-view-toggle">
              <button className={`dov-view-btn${viewMode==="main"?" active":""}`} onClick={()=>setViewMode("main")}>⚡ All panels</button>
              <button className={`dov-view-btn${viewMode==="charging"?" active":""}`} onClick={()=>setViewMode("charging")}>🔌 Charging</button>
            </div>
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
              <div className="dov-kpi-value">{data.filter(r=>r.kwh>0).length} <span className="dov-kpi-unit">/ {viewMode==="charging"?CHARGING_BREAKERS.length:MAIN_BREAKERS.length} panels</span></div>
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

          {/* Group bar chart + Peak split combined */}
          <div className="dov-card dov-group-card" style={{gridColumn:"span 2"}}>
            <div style={{display:"flex",gap:24,alignItems:"flex-end"}}>
              <div style={{flex:1}}>
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
                        <div style={{fontSize:9,color:"#666",marginTop:2}}>▼ details</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{width:1,background:"#1e2025",alignSelf:"stretch"}}/>
              <div style={{flexShrink:0}}>
                <div className="dov-card-title">Peak vs Off-Peak</div>
                <div className="dov-split-wrap">
                  {(() => {
                    const total = totalPeak + totalOff || 1;
                    const pkPct = (totalPeak/total)*100;
                    const offPct = (totalOff/total)*100;
                    const r = 50, cx = 65, cy = 65;
                    const circ = 2*Math.PI*r;
                    const pkDash = (pkPct/100)*circ;
                    const offDash = (offPct/100)*circ;
                    return (
                      <svg viewBox="0 0 130 130" width="120" height="120">
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2025" strokeWidth="16"/>
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2255bb" strokeWidth="16"
                          strokeDasharray={`${offDash} ${circ}`} strokeDashoffset={circ*0.25} strokeLinecap="round"/>
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#CC0010" strokeWidth="16"
                          strokeDasharray={`${pkDash} ${circ}`} strokeDashoffset={circ*0.25 - offDash} strokeLinecap="round"/>
                        <text x={cx} y={cy-4} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="500">{Math.round(pkPct)}%</text>
                        <text x={cx} y={cy+10} textAnchor="middle" fill="#888" fontSize="8">peak</text>
                      </svg>
                    );
                  })()}
                  <div className="dov-split-legend">
                    <div className="dov-split-item">
                      <span className="dov-split-dot" style={{background:"#CC0010"}}/>
                      <div><div className="dov-split-label">Peak</div><div className="dov-split-val">{fmt(totalPeak)}</div></div>
                    </div>
                    <div className="dov-split-item">
                      <span className="dov-split-dot" style={{background:"#2255bb"}}/>
                      <div><div className="dov-split-label">Off-Peak</div><div className="dov-split-val">{fmt(totalOff)}</div></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Charging stations card */}
          <div className="dov-card dov-charging-card">
            <div className="dov-card-title">🔌 Charging stations — PB1</div>
            <div className="dov-charging-wrap">
              {chargingData.map((b, i) => {
                const totalCharging = chargingData.reduce((s,r)=>s+r.kwh,0);
                const pct = totalCharging > 0 ? (b.kwh/totalCharging)*100 : 0;
                return (
                  <div key={b.id} className="dov-charging-item">
                    <div className="dov-charging-name">{b.displayName}</div>
                    <div className="dov-charging-kwh">{fmt(b.kwh)} <span style={{fontSize:11,color:"#888"}}>kWh</span></div>
                    <div className="dov-charging-ils">{Math.round(b.ils)} ILS</div>
                    <div className="dov-eff-bar-wrap" style={{marginTop:4}}>
                      <div style={{height:"100%",width:`${pct}%`,background:"#2255bb",borderRadius:2,minWidth:2}}/>
                    </div>
                    {i < chargingData.length-1 && <div className="dov-eff-divider" style={{marginTop:10}}/>}
                  </div>
                );
              })}
              <div className="dov-eff-divider" style={{margin:"10px 0"}}/>
              <div className="dov-charging-total">
                <div className="dov-eff-label">Total charging</div>
                <div className="dov-charging-kwh">{fmt(chargingData.reduce((s,r)=>s+r.kwh,0))} <span style={{fontSize:11,color:"#888"}}>kWh</span></div>
                <div className="dov-charging-ils">{Math.round(chargingData.reduce((s,r)=>s+r.ils,0))} ILS</div>
              </div>
            </div>
          </div>

          {/* Forecast + Peak Warning card — with tabs */}
          {(() => {
            const [activeTab, setActiveTab] = useState("forecast");
            const now = new Date();
            const hoursPassed = now.getHours() + now.getMinutes()/60;
            const hoursLeft = 24 - hoursPassed;
            const ratePerHour = hoursPassed > 0 ? totalKwh / hoursPassed : 0;
            const forecast = Math.round(totalKwh + ratePerHour * hoursLeft);
            const pctDay = Math.round((hoursPassed / 24) * 100);
            const hour = now.getHours();
            const day = now.getDay();
            const isSunThu = day >= 0 && day <= 4;
            const isPeakNow = isSunThu && hour >= 17 && hour < 22;
            const minutesToPeak = isSunThu && hour < 17 ? (17 - hour) * 60 - now.getMinutes() : null;
            const peakPctNum = totalKwh > 0 ? (totalPeak/totalKwh)*100 : 0;
            const highPeak = peakPctNum > 20;
            return (
              <div className="dov-card dov-forecast-card">
                <div className="dov-tab-header">
                  {[
                    {key:"forecast",  label:"Forecast"},
                    {key:"peak",      label:"Peak"},
                    {key:"compare",   label:"Compare"},
                  ].map(t => (
                    <button key={t.key}
                      className={`dov-tab-btn${activeTab===t.key?" active":""}`}
                      onClick={() => setActiveTab(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {activeTab === "forecast" && (
                  <div className="dov-forecast-wrap">
                    <div className="dov-forecast-item">
                      <div className="dov-eff-label">End-of-day forecast</div>
                      <div className="dov-forecast-value">{forecast.toLocaleString()} <span style={{fontSize:12,color:"#888"}}>kWh</span></div>
                      <div className="dov-eff-sub">{pctDay}% of day elapsed · {Math.round(ratePerHour)} kWh/h</div>
                      <div className="dov-eff-bar-wrap" style={{marginTop:6}}>
                        <div style={{height:"100%",width:`${pctDay}%`,background:"#2255bb",borderRadius:2,transition:"width 0.6s"}}/>
                      </div>
                    </div>
                    <div className="dov-eff-divider"/>
                    <div className="dov-forecast-item">
                      <div className="dov-eff-label">Current pace</div>
                      <div className="dov-forecast-value" style={{fontSize:20}}>{Math.round(ratePerHour)} <span style={{fontSize:12,color:"#888"}}>kWh/h</span></div>
                      <div className="dov-eff-sub">Hours remaining: {hoursLeft.toFixed(1)}h</div>
                    </div>
                  </div>
                )}

                {activeTab === "peak" && (
                  <div className="dov-forecast-wrap">
                    <div className="dov-forecast-item">
                      <div className="dov-eff-label">Peak hours status</div>
                      {isPeakNow ? (
                        <div className="dov-peak-badge dov-peak-active">⚠ Peak hours active now</div>
                      ) : minutesToPeak !== null && minutesToPeak <= 120 ? (
                        <div className="dov-peak-badge dov-peak-soon">⏰ Peak in {Math.floor(minutesToPeak/60)}h {minutesToPeak%60}m</div>
                      ) : (
                        <div className="dov-peak-badge dov-peak-off">✓ Off-peak</div>
                      )}
                      {highPeak && <div style={{fontSize:11,color:"#f0a000",marginTop:6}}>⚠ High peak usage detected</div>}
                    </div>
                    <div className="dov-eff-divider"/>
                    <div className="dov-forecast-item">
                      <div className="dov-eff-label">Today peak consumption</div>
                      <div className="dov-forecast-value" style={{color:"#CC0010"}}>{fmt(totalPeak)} <span style={{fontSize:12,color:"#888"}}>kWh</span></div>
                      <div className="dov-eff-sub">{Math.round(peakPctNum)}% of total today</div>
                      <div className="dov-eff-bar-wrap" style={{marginTop:6}}>
                        <div style={{height:"100%",width:`${Math.min(peakPctNum,100)}%`,background:"#CC0010",borderRadius:2}}/>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "compare" && (
                  <div className="dov-forecast-wrap">
                    <div style={{fontSize:12,color:"#bbb",marginBottom:8,fontWeight:500}}>
                      All main panels · up to {String(efficiency.currentHour||new Date().getHours()).padStart(2,"0")}:00
                    </div>
                    <div className="dov-eff-item">
                      <div className="dov-eff-label">vs Yesterday (same hours)</div>
                      <div className="dov-eff-value" style={{color:efficiency.yesterday==null?"#555":efficiency.yesterday<=0?"#1a7f37":"#CC0010"}}>
                        {efficiency.yesterday==null?"—":`${efficiency.yesterday>0?"+":""}${efficiency.yesterday.toFixed(1)}%`}
                      </div>
                      <div className="dov-eff-sub">{efficiency.yKwh!=null?`Yesterday: ${Math.round(efficiency.yKwh).toLocaleString()} kWh`:""}</div>
                      <div className="dov-eff-bar-wrap">
                        <div style={{height:"100%",width:`${Math.min(Math.abs(efficiency.yesterday||0),100)}%`,background:efficiency.yesterday!=null&&efficiency.yesterday<=0?"#1a7f37":"#CC0010",borderRadius:2}}/>
                      </div>
                    </div>
                    <div className="dov-eff-divider"/>
                    <div className="dov-eff-item">
                      <div className="dov-eff-label">vs Last week (same hours)</div>
                      <div className="dov-eff-value" style={{color:efficiency.lastWeek==null?"#555":efficiency.lastWeek<=0?"#1a7f37":"#CC0010"}}>
                        {efficiency.lastWeek==null?"—":`${efficiency.lastWeek>0?"+":""}${efficiency.lastWeek.toFixed(1)}%`}
                      </div>
                      <div className="dov-eff-sub">{efficiency.lwKwh!=null?`Last week: ${Math.round(efficiency.lwKwh).toLocaleString()} kWh`:""}</div>
                      <div className="dov-eff-bar-wrap">
                        <div style={{height:"100%",width:`${Math.min(Math.abs(efficiency.lastWeek||0),100)}%`,background:efficiency.lastWeek!=null&&efficiency.lastWeek<=0?"#1a7f37":"#CC0010",borderRadius:2}}/>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            );
          })()}

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
      {showChat && <AIChat onClose={() => setShowChat(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}