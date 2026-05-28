import { useState, useEffect, useCallback } from "react";
import { api } from "../api/api";
import Navbar from "../components/Navbar";
import AIChat from "../components/AIChat";
import SettingsModal from "../components/SettingsModal";
import "./TenantBillingPage.css";

const PERIOD_OPTIONS = [
  { label: "Today",      value: "today" },
  { label: "Yesterday",  value: "yesterday" },
  { label: "This week",  value: "week" },
  { label: "This month", value: "month" },
];

function getDateRange(period) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  if (period === "today") { const t = fmt(now); return { from: t, to: t }; }
  if (period === "yesterday") { const y = new Date(now); y.setDate(y.getDate()-1); const s = fmt(y); return { from: s, to: s }; }
  if (period === "week") { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return { from: fmt(s), to: fmt(now) }; }
  if (period === "month") { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { from: fmt(s), to: fmt(now) }; }
  return { from: fmt(now), to: fmt(now) };
}

function fmt(n) { return Number(n||0).toLocaleString(undefined, { maximumFractionDigits: 1 }); }
function fmtIls(n) { return Math.round(Number(n||0)).toLocaleString(); }

const TENANT_SHARE = 0.27;
const VAT = 0.18;

export default function TenantBillingPage() {
  const [period, setPeriod] = useState("today");
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState({ building: null, roof: null, parking: null });
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const fetchData = useCallback(async (p) => {
    setLoading(true);
    const { from, to } = getDateRange(p);

    const [b4, b22, b26, b27, b28, b1, b30] = await Promise.all([
      api.consumption("4",  from, to, "daily").catch(() => null),
      api.consumption("22", from, to, "daily").catch(() => null),
      api.consumption("26", from, to, "daily").catch(() => null),
      api.consumption("27", from, to, "daily").catch(() => null),
      api.consumption("28", from, to, "daily").catch(() => null),
      api.consumption("1",  from, to, "daily").catch(() => null),
      api.consumption("30", from, to, "daily").catch(() => null),
    ]);

    // Building: breaker 4 direct
    const b0TotalKwh = (b1?.total_kwh || 0) + (b30?.total_kwh || 0);
    const b0TotalIls = (b1?.total_amount || 0) + (b30?.total_amount || 0);
    const building = {
      kwh:       b4?.total_kwh    || 0,
      peak_kwh:  b4?.peak_kwh     || 0,
      off_kwh:   b4?.offpeak_kwh  || 0,
      ils:       b4?.total_amount || 0,
      b0Kwh:     b0TotalKwh,
      b0Ils:     b0TotalIls,
      otherKwh:  Math.max(0, b0TotalKwh - (b4?.total_kwh || 0)),
      otherIls:  Math.max(0, b0TotalIls - (b4?.total_amount || 0)),
      sharePct:  b0TotalKwh > 0 ? Math.round(((b4?.total_kwh || 0) / b0TotalKwh) * 100) : 0,
    };

    // Roof: (Roof Main * 0.27) + Q4 AEMAC CWM (breaker 26)
    const roofShare = (b22?.total_kwh || 0) * TENANT_SHARE;
    const roofShareIls = (b22?.total_amount || 0) * TENANT_SHARE;
    const roofAemac = b26?.total_kwh || 0;
    const roofAemacIls = b26?.total_amount || 0;
    const roof = {
      roofShare,
      roofShareIls,
      roofAemacKwh: roofAemac,
      roofAemacIls,
      kwh: roofShare + roofAemac,
      ils: roofShareIls + roofAemacIls,
      peak_kwh: ((b22?.peak_kwh || 0) * TENANT_SHARE) + (b26?.peak_kwh || 0),
      off_kwh:  ((b22?.offpeak_kwh || 0) * TENANT_SHARE) + (b26?.offpeak_kwh || 0),
    };

    // Parking: (PB Main - PB1 Main) * 0.27
    const pbNetKwh  = Math.max(0, (b27?.total_kwh    || 0) - (b28?.total_kwh    || 0));
    const pbNetIls  = Math.max(0, (b27?.total_amount || 0) - (b28?.total_amount || 0));
    const pbNetPeak = Math.max(0, (b27?.peak_kwh     || 0) - (b28?.peak_kwh     || 0));
    const pbNetOff  = Math.max(0, (b27?.offpeak_kwh  || 0) - (b28?.offpeak_kwh  || 0));
    const parking = {
      pbKwh:   b27?.total_kwh    || 0,
      pb1Kwh:  b28?.total_kwh    || 0,
      netKwh:  pbNetKwh,
      netIls:  pbNetIls,
      kwh:     pbNetKwh * TENANT_SHARE,
      ils:     pbNetIls * TENANT_SHARE,
      peak_kwh: pbNetPeak * TENANT_SHARE,
      off_kwh:  pbNetOff  * TENANT_SHARE,
    };

    setZones({ building, roof, parking });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(period); }, [period, fetchData]);

  const totalKwh = (zones.building?.kwh || 0) + (zones.roof?.kwh || 0) + (zones.parking?.kwh || 0);
  const totalIls = (zones.building?.ils || 0) + (zones.roof?.ils || 0) + (zones.parking?.ils || 0);
  const totalPeak = (zones.building?.peak_kwh || 0) + (zones.roof?.peak_kwh || 0) + (zones.parking?.peak_kwh || 0);
  const peakPct = totalKwh > 0 ? Math.round((totalPeak / totalKwh) * 100) : 0;
  const totalWithVat = totalIls * (1 + VAT);

  const periodLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label || "";

  return (
    <>
      <Navbar onOpenChat={() => setShowChat(true)} onOpenSettings={() => setShowSettings(true)} />
      <div className="tbp-page">

        {/* Topbar */}
        <div className="tbp-topbar">
          <div className="tbp-title-block">
            <div className="tbp-label">Tenant Billing</div>
            <div className="tbp-sub">NeuReality — Energy cost breakdown</div>
          </div>
          <div className="tbp-period-btns">
            {PERIOD_OPTIONS.map(o => (
              <button key={o.value} className={`tbp-period-btn${period === o.value ? " active" : ""}`}
                onClick={() => setPeriod(o.value)}>{o.label}</button>
            ))}
            <button className="tbp-refresh-btn" onClick={() => fetchData(period)} title="Refresh">↻</button>
          </div>
        </div>

        {loading && <div className="tbp-loading"><div className="tbp-spinner"/><span>Loading...</span></div>}

        {!loading && (
          <>
            {/* KPI row */}
            <div className="tbp-kpi-row">
              <div className="tbp-kpi">
                <div className="tbp-kpi-label">Total to charge</div>
                <div className="tbp-kpi-value">{fmtIls(totalIls)} <span className="tbp-kpi-unit">ILS</span></div>
                <div className="tbp-kpi-sub">{periodLabel}</div>
              </div>
              <div className="tbp-kpi">
                <div className="tbp-kpi-label">Building cost</div>
                <div className="tbp-kpi-value">{fmtIls(zones.building.ils)} <span className="tbp-kpi-unit">ILS</span></div>
                <div className="tbp-kpi-sub">{fmt(zones.building.kwh)} kWh direct</div>
              </div>
              <div className="tbp-kpi">
                <div className="tbp-kpi-label">Total consumption</div>
                <div className="tbp-kpi-value">{fmt(totalKwh)} <span className="tbp-kpi-unit">kWh</span></div>
                <div className="tbp-kpi-sub">Peak: {fmt(totalPeak)} kWh</div>
              </div>
              <div className="tbp-kpi">
                <div className="tbp-kpi-label">Peak ratio</div>
                <div className="tbp-kpi-value">{peakPct} <span className="tbp-kpi-unit">%</span></div>
                <div className="tbp-kpi-sub">Off-peak: {100 - peakPct}%</div>
              </div>
            </div>

            {/* Zone cards */}
            <div className="tbp-zones">

              {/* Building */}
              <div className="tbp-zone-card">
                <div className="tbp-zone-header tbp-zone-building">
                  <div className="tbp-zone-icon">🏢</div>
                  <div>
                    <div className="tbp-zone-name">Building</div>
                    <div className="tbp-zone-formula">Q4 2nd Floor NeuReality — direct metering</div>
                  </div>
                </div>
                <div className="tbp-zone-body">
                  <div className="tbp-metric"><span>Consumption</span><span>{fmt(zones.building.kwh)} kWh</span></div>
                  <div className="tbp-metric"><span>Peak hours</span><span className="tbp-red">{fmt(zones.building.peak_kwh)} kWh</span></div>
                  <div className="tbp-metric"><span>Off-peak hours</span><span className="tbp-blue">{fmt(zones.building.off_kwh)} kWh</span></div>

                  {/* Building comparison pie */}
                  {zones.building.b0Kwh > 0 && (
                    <div className="tbp-building-compare">
                      <div className="tbp-compare-pie-row">
                        <svg viewBox="0 0 60 60" width="58" height="58" style={{flexShrink:0}}>
                          {(() => {
                            const total = zones.building.b0Kwh || 1;
                            const neu = Math.min(zones.building.kwh || 0, total);
                            const pct = neu / total;
                            const angle = pct * 2 * Math.PI;
                            const x1 = 30 + 26 * Math.cos(-Math.PI/2);
                            const y1 = 30 + 26 * Math.sin(-Math.PI/2);
                            const x2 = 30 + 26 * Math.cos(-Math.PI/2 + angle);
                            const y2 = 30 + 26 * Math.sin(-Math.PI/2 + angle);
                            const large = angle > Math.PI ? 1 : 0;
                            return pct >= 1 ? (
                              <circle cx="30" cy="30" r="26" fill="#1a7f37"/>
                            ) : (
                              <>
                                <circle cx="30" cy="30" r="26" fill="#CC0010"/>
                                <path d={"M30,30 L"+x1.toFixed(1)+","+y1.toFixed(1)+" A26,26 0 "+large+",1 "+x2.toFixed(1)+","+y2.toFixed(1)+" Z"} fill="#1a7f37"/>
                                <circle cx="30" cy="30" r="13" fill="#0f1216"/>
                              </>
                            );
                          })()}
                          <text x="30" y="27" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{zones.building.sharePct}%</text>
                          <text x="30" y="36" textAnchor="middle" fill="#aaa" fontSize="6">NeuR.</text>
                        </svg>
                        <div className="tbp-compare-legend">
                          <div className="tbp-compare-row">
                            <span className="tbp-compare-dot" style={{background:"#1a7f37"}}/>
                            <span className="tbp-compare-name">NeuReality</span>
                            <span className="tbp-compare-val">{fmt(zones.building.kwh)} kWh</span>
                          </div>
                          <div className="tbp-compare-row">
                            <span className="tbp-compare-dot" style={{background:"#CC0010"}}/>
                            <span className="tbp-compare-name">B0 + PV total</span>
                            <span className="tbp-compare-val">{fmt(zones.building.b0Kwh)} kWh</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="tbp-zone-total">
                    <span>Zone cost</span>
                    <span className="tbp-amount">{fmtIls(zones.building.ils)} ILS</span>
                  </div>
                </div>
              </div>

              {/* Roof */}
              <div className="tbp-zone-card">
                <div className="tbp-zone-header tbp-zone-roof">
                  <div className="tbp-zone-icon">🌿</div>
                  <div>
                    <div className="tbp-zone-name">Roof</div>
                    <div className="tbp-zone-formula">Roof Main × 27% + Q4 AEMAC CWM</div>
                  </div>
                </div>
                <div className="tbp-zone-body">
                  <div className="tbp-metric"><span>Roof Main × 27%</span><span>{fmt(zones.roof.roofShare)} kWh</span></div>
                  <div className="tbp-metric"><span>Q4 AEMAC CWM (direct)</span><span>{fmt(zones.roof.roofAemacKwh)} kWh</span></div>
                  <div className="tbp-metric tbp-metric-total"><span>Total roof</span><span>{fmt(zones.roof.kwh)} kWh</span></div>
                  <div className="tbp-zone-total">
                    <span>Zone cost</span>
                    <span className="tbp-amount">{fmtIls(zones.roof.ils)} ILS</span>
                  </div>
                </div>
              </div>

              {/* Parking */}
              <div className="tbp-zone-card">
                <div className="tbp-zone-header tbp-zone-parking">
                  <div className="tbp-zone-icon">🚗</div>
                  <div>
                    <div className="tbp-zone-name">Parking</div>
                    <div className="tbp-zone-formula">(PB Main − PB1 Main) × 27%</div>
                  </div>
                </div>
                <div className="tbp-zone-body">
                  <div className="tbp-metric"><span>PB Main</span><span>{fmt(zones.parking.pbKwh)} kWh</span></div>
                  <div className="tbp-metric"><span>PB1 (charging — excluded)</span><span className="tbp-red">− {fmt(zones.parking.pb1Kwh)} kWh</span></div>
                  <div className="tbp-metric tbp-metric-total"><span>Net parking × 27%</span><span>{fmt(zones.parking.kwh)} kWh</span></div>
                  <div className="tbp-zone-total">
                    <span>Zone cost</span>
                    <span className="tbp-amount">{fmtIls(zones.parking.ils)} ILS</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row: Invoice + Pie + Export */}
            <div className="tbp-bottom-row">

              <div className="tbp-invoice-card">
                <div className="tbp-invoice-title">Invoice summary — {periodLabel}</div>
                <div className="tbp-invoice-grid">
                  <div className="tbp-inv-row"><span>Building (Q4 2nd Floor — direct)</span><span>{fmtIls(zones.building.ils)} ILS</span></div>
                  <div className="tbp-inv-row"><span>Roof (27% + AEMAC CWM)</span><span>{fmtIls(zones.roof.ils)} ILS</span></div>
                  <div className="tbp-inv-row"><span>Parking (PB − PB1) × 27%</span><span>{fmtIls(zones.parking.ils)} ILS</span></div>
                  <div className="tbp-inv-divider"/>
                  <div className="tbp-inv-total">
                    <span>Total to charge</span>
                    <span>{fmtIls(totalIls)} ILS</span>
                  </div>
                </div>
              </div>

              <div className="tbp-pie-card">
                <div className="tbp-invoice-title">Cost breakdown</div>
                {(() => {
                  const zones3 = [
                    { name: "Building", ils: zones.building.ils, color: "#2255bb" },
                    { name: "Roof",     ils: zones.roof.ils,     color: "#1a7f37" },
                    { name: "Parking",  ils: zones.parking.ils,  color: "#f0a000" },
                  ];
                  const total = zones3.reduce((s,z)=>s+z.ils,0) || 1;
                  const CX=80, CY=80, R=65;
                  let angle = -Math.PI/2;
                  const slices = zones3.map(z => {
                    const pct = z.ils/total;
                    const a = pct * 2 * Math.PI;
                    const x1 = CX + R*Math.cos(angle);
                    const y1 = CY + R*Math.sin(angle);
                    const x2 = CX + R*Math.cos(angle+a);
                    const y2 = CY + R*Math.sin(angle+a);
                    const large = a > Math.PI ? 1 : 0;
                    const sl = { ...z, x1, y1, x2, y2, large, pct };
                    angle += a;
                    return sl;
                  });
                  return (
                    <div className="tbp-pie-wrap">
                      <svg viewBox="0 0 160 160" width="160" height="160">
                        {slices.map((s,i) => (
                          slices.length === 1
                            ? <circle key={i} cx={CX} cy={CY} r={R} fill={s.color}/>
                            : <path key={i} d={"M"+CX+","+CY+" L"+s.x1+","+s.y1+" A"+R+","+R+" 0 "+s.large+",1 "+s.x2+","+s.y2+" Z"} fill={s.color} stroke="#0f1114" strokeWidth="2"/>
                        ))}
                        <circle cx={CX} cy={CY} r={36} fill="#0f1114"/>
                        <text x={CX} y={CY-4} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600">{fmtIls(totalIls)}</text>
                        <text x={CX} y={CY+10} textAnchor="middle" fill="#888" fontSize="8">ILS</text>
                      </svg>
                      <div className="tbp-pie-legend">
                        {slices.map((s,i) => (
                          <div key={i} className="tbp-pie-leg-item">
                            <span className="tbp-pie-leg-dot" style={{background:s.color}}/>
                            <span className="tbp-pie-leg-name">{s.name}</span>
                            <span className="tbp-pie-leg-pct">{Math.round(s.pct*100)}%</span>
                            <span className="tbp-pie-leg-ils">{fmtIls(s.ils)} ILS</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="tbp-export-card">
                <div className="tbp-invoice-title">Export</div>
                <div className="tbp-export-body">
                  <div className="tbp-export-info">
                    <div className="tbp-export-tenant">NeuReality</div>
                    <div className="tbp-export-period">{periodLabel} invoice</div>
                    <div className="tbp-export-amount">{fmtIls(totalIls)} ILS</div>
                    <div className="tbp-export-vat">Excl. VAT</div>
                  </div>
                  <button className="tbp-export-btn" onClick={() => {
                    const bKwh = fmt(zones.building.kwh);
                    const rKwh = fmt(zones.roof.kwh);
                    const pKwh = fmt(zones.parking.kwh);
                    const bIls = fmtIls(zones.building.ils);
                    const rIls = fmtIls(zones.roof.ils);
                    const pIls = fmtIls(zones.parking.ils);
                    const sub = fmtIls(totalIls);
                    const vat = fmtIls(totalIls*VAT);
                    const tot = fmtIls(totalWithVat);
                    const invNo = "INV-" + new Date().toISOString().slice(0,10).replace(/-/g,"");
                    const html = "<!DOCTYPE html><html><head><meta charset=utf-8><title>NeuReality Invoice</title><style>"
                      + "body{margin:0;padding:0;background:#0d1017;font-family:Arial,sans-serif;color:#ddd}"
                      + ".page{max-width:760px;margin:0 auto;padding:32px}"
                      + ".header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:0.5px solid #1e2025;margin-bottom:20px}"
                      + ".logo{font-size:32px;font-weight:700;color:#CC0010;letter-spacing:4px}"
                      + ".inv-title{font-size:18px;font-weight:700;color:#fff;margin-top:6px}"
                      + ".inv-sub{font-size:13px;color:#aaa;margin-top:4px}"
                      + ".inv-no{font-size:12px;color:#555;font-family:monospace;text-align:right}"
                      + ".kpi-row{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-bottom:20px;border:0.5px solid #1e2025;border-radius:8px;overflow:hidden}"
                      + ".kpi{padding:14px 18px;background:#111417;border-right:0.5px solid #1e2025}"
                      + ".kpi:last-child{border-right:none}"
                      + ".kpi-label{font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px}"
                      + ".kpi-val{font-size:22px;font-weight:700;color:#fff;font-family:monospace}"
                      + ".kpi-val.accent{color:#00a8cc}"
                      + ".zones{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}"
                      + ".zone{background:#111417;border-radius:8px;padding:14px 16px;border-left:3px solid}"
                      + ".zone.b{border-color:#2255bb}.zone.r{border-color:#1a7f37}.zone.p{border-color:#f0a000}"
                      + ".zone-name{font-size:14px;font-weight:700;color:#fff;margin-bottom:3px}"
                      + ".zone-formula{font-size:11px;color:#888;margin-bottom:10px}"
                      + ".zone-row{display:flex;justify-content:space-between;font-size:13px;color:#bbb;margin-bottom:3px}"
                      + ".zone-ils{font-size:22px;font-weight:700;color:#fff;font-family:monospace;margin-top:8px}"
                      + ".pie-row{display:flex;align-items:center;gap:20px;padding:16px 18px;background:#111417;border-radius:8px;margin-bottom:20px}"
                      + ".pie-legend{flex:1;display:flex;flex-direction:column;gap:10px}"
                      + ".pie-item{display:flex;align-items:center;gap:8px;font-size:13px}"
                      + ".dot{width:10px;height:10px;border-radius:2px;flex-shrink:0}"
                      + ".pie-name{flex:1;color:#ddd;font-weight:500}"
                      + ".pie-bar{flex:2;height:5px;background:#1e2025;border-radius:3px;overflow:hidden}"
                      + ".pie-fill{height:100%;border-radius:3px}"
                      + ".pie-pct{color:#aaa;min-width:32px;text-align:right;font-size:12px}"
                      + ".pie-amt{color:#fff;font-weight:700;font-family:monospace;font-weight:600;min-width:72px;text-align:right}"
                      + ".total-bar{display:flex;justify-content:space-between;align-items:center;background:#0a0c0f;border:0.5px solid #1e2025;border-radius:8px;padding:14px 20px;margin-bottom:20px}"
                      + ".total-label{font-size:13px;color:#aaa;text-transform:uppercase;letter-spacing:1.5px}"
                      + ".total-val{font-size:30px;font-weight:700;color:#00a8cc;font-family:monospace}"
                      + ".footer{font-size:12px;color:#777;display:flex;justify-content:space-between;border-top:0.5px solid #1e2025;padding-top:12px}"
                      + "@media print{body{background:#0d1017!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}"
                      + "</style></head><body><div class=page>"
                      + "<div class=header><div><div class=logo>ABB</div><div class=inv-title>NeuReality — Energy Invoice</div><div class=inv-sub>Period: " + periodLabel + " &nbsp;|&nbsp; Generated: " + new Date().toLocaleDateString() + "</div></div>"
                      + "<div class=inv-no><div style='color:#aaa;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px'>Invoice no.</div>" + invNo + "</div></div>"
                      + "<div class=kpi-row>"
                      + "<div class=kpi><div class=kpi-label>Building</div><div class=kpi-val>" + bIls + " ILS</div></div>"
                      + "<div class=kpi><div class=kpi-label>Roof + Parking</div><div class=kpi-val>" + Math.round((zones.roof.ils||0)+(zones.parking.ils||0)).toLocaleString() + " ILS</div></div>"
                      + "<div class='kpi'><div class=kpi-label>Total</div><div class='kpi-val accent'>" + sub + " ILS</div></div>"
                      + "</div>"
                      + "<div class=zones>"
                      + "<div class='zone b'><div class=zone-name>Building</div><div class=zone-formula>Q4 2nd Floor — direct metering</div>"
                      + "<div class=zone-row><span>Consumption</span><span>" + bKwh + " kWh</span></div>"
                      + "<div class=zone-row><span>Peak hours</span><span style='color:#e05060'>" + fmt(zones.building.peak_kwh) + " kWh</span></div>"
                      + "<div class=zone-row><span>Off-peak</span><span>" + fmt(zones.building.off_kwh) + " kWh</span></div>"
                      + "<div class=zone-ils>" + bIls + " ILS</div></div>"
                      + "<div class='zone r'><div class=zone-name>Roof</div><div class=zone-formula>Roof × 27% + Q4 AEMAC CWM</div>"
                      + "<div class=zone-row><span>Roof × 27%</span><span>" + fmt(zones.roof.roofShare) + " kWh</span></div>"
                      + "<div class=zone-row><span>AEMAC direct</span><span>" + fmt(zones.roof.roofAemacKwh) + " kWh</span></div>"
                      + "<div class=zone-row><span>Total</span><span>" + rKwh + " kWh</span></div>"
                      + "<div class=zone-ils>" + rIls + " ILS</div></div>"
                      + "<div class='zone p'><div class=zone-name>Parking</div><div class=zone-formula>(PB − PB1) × 27%</div>"
                      + "<div class=zone-row><span>PB Main</span><span>" + fmt(zones.parking.pbKwh) + " kWh</span></div>"
                      + "<div class=zone-row><span>− PB1 charging</span><span style='color:#e05060'>" + fmt(zones.parking.pb1Kwh) + " kWh</span></div>"
                      + "<div class=zone-row><span>Net × 27%</span><span>" + pKwh + " kWh</span></div>"
                      + "<div class=zone-ils>" + pIls + " ILS</div></div>"
                      + "</div>"
                      + "<div class=pie-row><svg viewBox='0 0 120 120' width='90' height='90' style='flex-shrink:0'>"
                      + "<path d='M60,60 L60,10 A50,50 0 0,1 107,85 Z' fill='#2255bb'/>"
                      + "<path d='M60,60 L107,85 A50,50 0 0,1 24,90 Z' fill='#1a7f37'/>"
                      + "<path d='M60,60 L24,90 A50,50 0 0,1 60,10 Z' fill='#f0a000'/>"
                      + "<circle cx='60' cy='60' r='28' fill='#111417'/>"
                      + "<text x='60' y='57' text-anchor='middle' fill='#fff' font-size='9' font-weight='700'>" + sub + "</text>"
                      + "<text x='60' y='68' text-anchor='middle' fill='#555' font-size='7'>ILS</text>"
                      + "</svg><div class=pie-legend>"
                      + "<div class=pie-item><div class=dot style='background:#2255bb'></div><span class=pie-name>Building</span><div class=pie-bar><div class=pie-fill style='width:" + Math.round((zones.building.ils||0)/((totalIls||1))*100) + "%;background:#2255bb'></div></div><span class=pie-pct>" + Math.round((zones.building.ils||0)/(totalIls||1)*100) + "%</span><span class=pie-amt>" + bIls + " ILS</span></div>"
                      + "<div class=pie-item><div class=dot style='background:#1a7f37'></div><span class=pie-name>Roof</span><div class=pie-bar><div class=pie-fill style='width:" + Math.round((zones.roof.ils||0)/(totalIls||1)*100) + "%;background:#1a7f37'></div></div><span class=pie-pct>" + Math.round((zones.roof.ils||0)/(totalIls||1)*100) + "%</span><span class=pie-amt>" + rIls + " ILS</span></div>"
                      + "<div class=pie-item><div class=dot style='background:#f0a000'></div><span class=pie-name>Parking</span><div class=pie-bar><div class=pie-fill style='width:" + Math.round((zones.parking.ils||0)/(totalIls||1)*100) + "%;background:#f0a000'></div></div><span class=pie-pct>" + Math.round((zones.parking.ils||0)/(totalIls||1)*100) + "%</span><span class=pie-amt>" + pIls + " ILS</span></div>"
                      + "</div></div>"
                      + "<div class=total-bar><span class=total-label>Total to charge</span><span class=total-val>" + sub + " ILS</span></div>"
                      + "<div class=footer><span>ABB Energy Monitoring System</span><span>" + new Date().toLocaleString() + "</span></div>"
                      + "</div></body></html>"
                    const w = window.open("", "_blank");
                    w.document.write(html);
                    w.document.close();
                    w.print();
                  }}>
                    Export &amp; Print PDF
                  </button>
                </div>
              </div>

            </div>
          </>
        )}
      </div>
      {showChat && <AIChat onClose={() => setShowChat(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}