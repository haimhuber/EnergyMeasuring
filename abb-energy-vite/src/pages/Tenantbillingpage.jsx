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
  if (period === "today")     { const t = fmt(now); return { from: t, to: t }; }
  if (period === "yesterday") { const y = new Date(now); y.setDate(y.getDate()-1); const s = fmt(y); return { from: s, to: s }; }
  if (period === "week")      { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return { from: fmt(s), to: fmt(now) }; }
  if (period === "month")     { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { from: fmt(s), to: fmt(now) }; }
  return { from: fmt(now), to: fmt(now) };
}

function fmt(n)    { return Number(n||0).toLocaleString(undefined, { maximumFractionDigits: 1 }); }
function fmtIls(n) { return Math.round(Number(n||0)).toLocaleString(); }

const TENANT_SHARE = 0.27;

export default function TenantBillingPage() {
  const [period, setPeriod]       = useState("today");
  const [loading, setLoading]     = useState(true);
  const [zones, setZones]         = useState({ building: null, roof: null, parking: null });
  const [showChat, setShowChat]   = useState(false);
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

    const b0TotalKwh = (b1?.total_kwh || 0) + (b30?.total_kwh || 0);
    const b0TotalIls = (b1?.total_amount || 0) + (b30?.total_amount || 0);

    const building = {
      kwh:      b4?.total_kwh    || 0,
      peak_kwh: b4?.peak_kwh     || 0,
      off_kwh:  b4?.offpeak_kwh  || 0,
      ils:      b4?.total_amount || 0,
      b0Kwh:    b0TotalKwh,
      b0Ils:    b0TotalIls,
      otherKwh: Math.max(0, b0TotalKwh - (b4?.total_kwh || 0)),
      sharePct: b0TotalKwh > 0 ? Math.round(((b4?.total_kwh || 0) / b0TotalKwh) * 100) : 0,
    };

    const roofShare    = (b22?.total_kwh    || 0) * TENANT_SHARE;
    const roofShareIls = (b22?.total_amount || 0) * TENANT_SHARE;
    const roofAemac    = b26?.total_kwh    || 0;
    const roofAemacIls = b26?.total_amount || 0;
    const roof = {
      roofShare, roofShareIls,
      roofAemacKwh: roofAemac,
      roofAemacIls,
      kwh: roofShare + roofAemac,
      ils: roofShareIls + roofAemacIls,
      peak_kwh: ((b22?.peak_kwh    || 0) * TENANT_SHARE) + (b26?.peak_kwh    || 0),
      off_kwh:  ((b22?.offpeak_kwh || 0) * TENANT_SHARE) + (b26?.offpeak_kwh || 0),
    };

    const pbNetKwh  = Math.max(0, (b27?.total_kwh    || 0) - (b28?.total_kwh    || 0));
    const pbNetIls  = Math.max(0, (b27?.total_amount || 0) - (b28?.total_amount || 0));
    const parking = {
      pbKwh:   b27?.total_kwh    || 0,
      pb1Kwh:  b28?.total_kwh    || 0,
      pb27Ils: (b27?.total_amount || 0) * TENANT_SHARE,
      pb28Ils: (b28?.total_amount || 0) * TENANT_SHARE,
      netKwh:  pbNetKwh,
      kwh:     pbNetKwh * TENANT_SHARE,
      ils:     pbNetIls * TENANT_SHARE,
      peak_kwh: Math.max(0, (b27?.peak_kwh || 0) - (b28?.peak_kwh || 0)) * TENANT_SHARE,
      off_kwh:  Math.max(0, (b27?.offpeak_kwh || 0) - (b28?.offpeak_kwh || 0)) * TENANT_SHARE,
    };

    setZones({ building, roof, parking });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(period); }, [period, fetchData]);

  const totalKwh  = (zones.building?.kwh || 0) + (zones.roof?.kwh || 0) + (zones.parking?.kwh || 0);
  const totalIls  = (zones.building?.ils || 0) + (zones.roof?.ils || 0) + (zones.parking?.ils || 0);
  const totalPeak = (zones.building?.peak_kwh || 0) + (zones.roof?.peak_kwh || 0) + (zones.parking?.peak_kwh || 0);
  const peakPct   = totalKwh > 0 ? Math.round((totalPeak / totalKwh) * 100) : 0;
  const periodLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label || "";

  function buildInvoiceHtml() {
    const z = zones;
    if (!z.building || !z.roof || !z.parking) return "";
    const bKwh = fmt(z.building.kwh), rKwh = fmt(z.roof.kwh), pKwh = fmt(z.parking.kwh);
    const bIls = fmtIls(z.building.ils), rIls = fmtIls(z.roof.ils), pIls = fmtIls(z.parking.ils);
    const sub  = fmtIls(totalIls);
    const bPeak = fmt(z.building.peak_kwh), bOff = fmt(z.building.off_kwh);
    const roofShareKwh = fmt(z.roof.roofShare), roofAemacKwh = fmt(z.roof.roofAemacKwh);
    const pbMain = fmt(z.parking.pbKwh), pb1 = fmt(z.parking.pb1Kwh);
    const b0Tot = fmt(z.building.b0Kwh), b0Ils = fmtIls(z.building.b0Ils);
    const sharePct = z.building.sharePct || 0;
    const neuPct  = Math.round((z.building.ils / (totalIls || 1)) * 100);
    const roofPct = Math.round((z.roof.ils / (totalIls || 1)) * 100);
    const parkPct = 100 - neuPct - roofPct;
    const invNo   = "INV-" + new Date().toISOString().slice(0,10).replace(/-/g,"");
    const genDate = new Date().toLocaleDateString("en-GB", {weekday:"long",year:"numeric",month:"long",day:"numeric"});
    const genTime = new Date().toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"}) + " IDT";
    const roofPlusParking = fmtIls((z.roof.ils||0)+(z.parking.ils||0));
    const roofPlusParkingKwh = fmt((z.roof.kwh||0)+(z.parking.kwh||0));
    const totalFmt = fmt(totalKwh);

    const css = [
      "*{box-sizing:border-box;margin:0;padding:0}",
      "body{background:#fff;font-family:'Segoe UI',Arial,sans-serif;color:#111}",
      ".inv{max-width:720px;margin:0 auto}",
      ".stripe{height:3px;background:#CC0010}",
      ".hdr{background:#0a0c0f;padding:20px 28px;display:flex;justify-content:space-between;align-items:flex-start}",
      ".logo{font-size:30px;font-weight:900;color:#fff;letter-spacing:4px}",
      ".logo-sub{font-size:9px;color:#CC0010;letter-spacing:3px;text-transform:uppercase;margin-top:2px}",
      ".badge{background:rgba(204,0,16,0.15);border:1px solid rgba(204,0,16,0.3);border-radius:4px;padding:3px 10px;font-size:9px;color:#CC0010;letter-spacing:2px;font-weight:700;margin-bottom:6px;display:inline-block}",
      ".hdr-title{font-size:16px;font-weight:600;color:#fff}",
      ".hdr-meta{font-size:11px;color:#888;margin-top:2px}",
      ".ts-bar{background:#f5f5f5;padding:6px 28px;display:flex;justify-content:space-between;border-bottom:1px solid #e8e8e8}",
      ".ts-item{font-size:10px;color:#999;font-weight:500;letter-spacing:1px;text-transform:uppercase}",
      ".ts-item b{color:#111;font-weight:700}",
      ".kpi-row{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #eee}",
      ".kpi{padding:14px 18px;border-right:1px solid #eee;position:relative}",
      ".kpi:last-child{border-right:none}",
      ".kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}",
      ".k1::before{background:#2255bb}.k2::before{background:#1a7f37}.k3::before{background:#CC0010}",
      ".kpi-label{font-size:9px;color:#aaa;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px}",
      ".kpi-val{font-size:20px;font-weight:700;color:#111;font-family:monospace}",
      ".kpi-acc{font-size:20px;font-weight:700;color:#CC0010;font-family:monospace}",
      ".kpi-sub{font-size:10px;color:#aaa;margin-top:2px}",
      ".body{padding:20px 28px}",
      ".sec{display:flex;align-items:center;gap:8px;margin:16px 0 12px}",
      ".sec-line{flex:1;height:0.5px;background:#e8e8e8}",
      ".sec-lbl{font-size:9px;color:#CC0010;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;white-space:nowrap}",
      ".zones{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}",
      ".zone{border-radius:6px;overflow:hidden;border:0.5px solid #e8e8e8}",
      ".ztop{padding:10px 12px 8px}",
      ".ztag{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}",
      ".zname{font-size:10px;color:#999;margin-bottom:6px}",
      ".zils{font-size:20px;font-weight:700;color:#111;font-family:monospace;margin-bottom:6px}",
      ".zrow{display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:2px}",
      ".cmp{display:grid;grid-template-columns:1fr 90px;gap:12px;align-items:center;background:#f9f9f9;border:0.5px solid #eee;border-radius:8px;padding:14px 16px;margin-bottom:8px}",
      ".cmp-stats{display:grid;grid-template-columns:1fr 1px 1fr;gap:0}",
      ".cmp-div{background:#e8e8e8}",
      ".cmp-stat{padding:0 14px}.cmp-stat-f{padding-left:0}",
      ".cmp-lbl{display:flex;align-items:center;gap:6px;font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}",
      ".cdot{width:8px;height:8px;border-radius:2px;display:inline-block;flex-shrink:0}",
      ".cmp-kwh{font-size:18px;font-weight:700;font-family:monospace;line-height:1}",
      ".cmp-sub{font-size:10px;color:#aaa;margin-top:2px}",
      ".pw{display:flex;align-items:center;gap:16px;background:#f9f9f9;border:0.5px solid #eee;border-radius:8px;padding:14px 18px;margin-bottom:8px}",
      ".pleg{flex:1;display:flex;flex-direction:column;gap:7px}",
      ".prow{display:flex;align-items:center;gap:8px}",
      ".pdot{width:8px;height:8px;border-radius:2px;flex-shrink:0;display:inline-block}",
      ".pname{flex:1;font-size:11px;color:#666}",
      ".pbar{width:80px;height:3px;background:#e8e8e8;border-radius:2px;overflow:hidden}",
      ".pfill{height:100%;border-radius:2px}",
      ".ppct{font-size:10px;color:#bbb;min-width:24px;text-align:right}",
      ".pamt{font-size:11px;font-weight:700;color:#111;min-width:56px;text-align:right;font-family:monospace}",
      ".tot{background:#0f1114;border-radius:6px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}",
      ".tot-lbl{font-size:9px;color:#aaa;font-weight:600;text-transform:uppercase;letter-spacing:1.5px}",
      ".tot-val{font-size:24px;font-weight:700;color:#fff;font-family:monospace}",
      ".ftr{background:#f5f5f5;border-top:1px solid #eee;padding:10px 28px;display:flex;justify-content:space-between}",
      ".ftxt{font-size:10px;color:#bbb}",
      "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}",
    ].join("");

    return [
      "<!DOCTYPE html><html><head><meta charset=utf-8><title>NeuReality Invoice</title>",
      "<style>" + css + "</style></head><body><div class=inv>",
      "<div class=stripe></div>",
      "<div class=hdr>",
        "<div><div class=logo>ABB</div><div class=logo-sub>Energy Monitoring System</div></div>",
        "<div style='text-align:right'>",
          "<div class=badge>NeuReality Tenant Invoice</div>",
          "<div class=hdr-title>Energy cost breakdown</div>",
          "<div class=hdr-meta>" + genDate + " &middot; QESARIYYA &middot; " + invNo + "</div>",
        "</div>",
      "</div>",
      "<div class=ts-bar>",
        "<div class=ts-item>Period: <b>" + periodLabel + "</b></div>",
        "<div class=ts-item>Generated: <b>" + genTime + "</b></div>",
      "</div>",
      "<div class=kpi-row>",
        "<div class='kpi k1'><div class=kpi-label>Building</div><div class=kpi-val>" + bIls + " ILS</div><div class=kpi-sub>" + bKwh + " kWh direct</div></div>",
        "<div class='kpi k2'><div class=kpi-label>Roof + Parking</div><div class=kpi-val>" + roofPlusParking + " ILS</div><div class=kpi-sub>" + roofPlusParkingKwh + " kWh allocated</div></div>",
        "<div class='kpi k3'><div class=kpi-label>Total to charge</div><div class=kpi-acc>" + sub + " ILS</div><div class=kpi-sub>" + totalFmt + " kWh total</div></div>",
      "</div>",
      "<div class=body>",
        "<div class=sec style='margin-top:0'><div class=sec-lbl>Cost per zone</div><div class=sec-line></div></div>",
        "<div class=zones>",
          "<div class=zone><div class=ztop style='background:#2255bb0d'>",
            "<div class=ztag style='color:#2255bb'>Building</div>",
            "<div class=zname>Q4 2nd Floor &mdash; direct metering</div>",
            "<div class=zils>" + bIls + " ILS</div>",
            "<div class=zrow><span>Consumption</span><span>" + bKwh + " kWh</span></div>",
            "<div class=zrow><span style='color:#CC0010'>Peak</span><span style='color:#CC0010'>" + bPeak + " kWh</span></div>",
            "<div class=zrow><span>Off-peak</span><span>" + bOff + " kWh</span></div>",
          "</div></div>",
          "<div class=zone><div class=ztop style='background:#1a7f370d'>",
            "<div class=ztag style='color:#1a7f37'>Roof</div>",
            "<div class=zname>Roof &times; 27% + Q4 AEMAC CWM</div>",
            "<div class=zils>" + rIls + " ILS</div>",
            "<div class=zrow><span>Roof &times; 27%</span><span>" + roofShareKwh + " kWh</span></div>",
            "<div class=zrow><span>AEMAC direct</span><span>" + roofAemacKwh + " kWh</span></div>",
            "<div class=zrow><span>Total</span><span>" + rKwh + " kWh</span></div>",
          "</div></div>",
          "<div class=zone><div class=ztop style='background:#f0a0000d'>",
            "<div class=ztag style='color:#c07000'>Parking</div>",
            "<div class=zname>(PB &minus; PB1) &times; 27%</div>",
            "<div class=zils>" + pIls + " ILS</div>",
            "<div class=zrow><span>PB Main</span><span>" + pbMain + " kWh</span></div>",
            "<div class=zrow><span style='color:#CC0010'>&minus; PB1 charging</span><span style='color:#CC0010'>" + pb1 + " kWh</span></div>",
            "<div class=zrow><span>Net &times; 27%</span><span>" + pKwh + " kWh</span></div>",
          "</div></div>",
        "</div>",
        "<div class=sec><div class=sec-lbl>Building share</div><div class=sec-line></div></div>",
        "<div class=cmp>",
          "<div class=cmp-stats>",
            "<div class='cmp-stat cmp-stat-f'>",
              "<div class=cmp-lbl><span class=cdot style='background:#1a5c2a'></span>NeuReality</div>",
              "<div class=cmp-kwh style='color:#1a7f37'>" + bKwh + " kWh</div>",
              "<div class=cmp-sub>" + bIls + " ILS &middot; " + sharePct + "% of building</div>",
            "</div>",
            "<div class=cmp-div></div>",
            "<div class=cmp-stat>",
              "<div class=cmp-lbl><span class=cdot style='background:#7a0008'></span>B0 + PV total</div>",
              "<div class=cmp-kwh style='color:#CC0010'>" + b0Tot + " kWh</div>",
              "<div class=cmp-sub>" + b0Ils + " ILS &middot; 100%</div>",
            "</div>",
          "</div>",
          "<svg viewBox='0 0 100 100' width='80' height='80'>",
            "<circle cx='50' cy='50' r='42' fill='#CC0010'/>",
            "<path d='M50,50 L50,8 A42,42 0 0,1 50,92 Z' fill='#1a7f37'/>",
            "<circle cx='50' cy='50' r='22' fill='#f9f9f9'/>",
            "<text x='50' y='47' text-anchor='middle' fill='#111' font-size='12' font-weight='700'>" + sharePct + "%</text>",
            "<text x='50' y='58' text-anchor='middle' fill='#aaa' font-size='8'>NeuR.</text>",
          "</svg>",
        "</div>",
        "<div class=sec><div class=sec-lbl>Consumption breakdown</div><div class=sec-line></div></div>",
        "<div class=pw>",
          "<svg viewBox='0 0 120 120' width='100' height='100'>",
            "<path d='M60,60 L60,10 A50,50 0 0,1 103,75 Z' fill='#2255bb'/>",
            "<path d='M60,60 L103,75 A50,50 0 0,1 26,84 Z' fill='#1a7f37'/>",
            "<path d='M60,60 L26,84 A50,50 0 0,1 60,10 Z' fill='#f0a000'/>",
            "<circle cx='60' cy='60' r='26' fill='#f9f9f9'/>",
            "<text x='60' y='57' text-anchor='middle' fill='#111' font-size='10' font-weight='700'>" + sub + "</text>",
            "<text x='60' y='68' text-anchor='middle' fill='#aaa' font-size='7'>ILS</text>",
          "</svg>",
          "<div class=pleg>",
            "<div class=prow><span class=pdot style='background:#2255bb'></span><span class=pname>Building</span><div class=pbar><div class=pfill style='width:" + neuPct + "%;background:#2255bb'></div></div><span class=ppct>" + neuPct + "%</span><span class=pamt>" + bIls + " ILS</span></div>",
            "<div class=prow><span class=pdot style='background:#1a7f37'></span><span class=pname>Roof</span><div class=pbar><div class=pfill style='width:" + roofPct + "%;background:#1a7f37'></div></div><span class=ppct>" + roofPct + "%</span><span class=pamt>" + rIls + " ILS</span></div>",
            "<div class=prow><span class=pdot style='background:#f0a000'></span><span class=pname>Parking</span><div class=pbar><div class=pfill style='width:" + parkPct + "%;background:#f0a000'></div></div><span class=ppct>" + parkPct + "%</span><span class=pamt>" + pIls + " ILS</span></div>",
          "</div>",
        "</div>",
        "<div class=tot><div class=tot-lbl>Total to charge</div><div class=tot-val>" + sub + " ILS</div></div>",
      "</div>",
      "<div class=ftr><div class=ftxt>ABB Energy Monitoring &middot; QESARIYYA</div><div class=ftxt>" + new Date().toLocaleString() + "</div></div>",
      "</div></body></html>",
    ].join("");
  }

  function handleExport() {
    const html = buildInvoiceHtml();
    if (!html) return;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.print();
  }

  const showContent = !loading && zones.building && zones.roof && zones.parking;

  return (
    <>
      <Navbar onOpenChat={() => setShowChat(true)} onOpenSettings={() => setShowSettings(true)} />
      <div className="tbp-page">

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
            <button className="tbp-refresh-btn" onClick={() => fetchData(period)} title="Refresh">&#8635;</button>
          </div>
        </div>

        {loading && (
          <div className="tbp-loading">
            <div className="tbp-spinner" />
            <span>Loading...</span>
          </div>
        )}

        {showContent && (
          <>
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

            <div className="tbp-zones">
              <div className="tbp-zone-card">
                <div className="tbp-zone-header tbp-zone-building">
                  <div className="tbp-zone-icon">&#127970;</div>
                  <div>
                    <div className="tbp-zone-name">Building</div>
                    <div className="tbp-zone-formula">Q4 2nd Floor NeuReality — direct metering</div>
                  </div>
                </div>
                <div className="tbp-zone-body">
                  <div className="tbp-metric"><span>Consumption</span><span>{fmt(zones.building.kwh)} kWh</span></div>
                  <div className="tbp-metric"><span>Peak hours</span><span className="tbp-red">{fmt(zones.building.peak_kwh)} kWh</span></div>
                  <div className="tbp-metric"><span>Off-peak hours</span><span className="tbp-blue">{fmt(zones.building.off_kwh)} kWh</span></div>
                  <div className="tbp-zone-total">
                    <span>Zone cost</span>
                    <span className="tbp-amount">{fmtIls(zones.building.ils)} ILS</span>
                  </div>
                </div>
              </div>

              <div className="tbp-zone-card">
                <div className="tbp-zone-header tbp-zone-roof">
                  <div className="tbp-zone-icon">&#127807;</div>
                  <div>
                    <div className="tbp-zone-name">Roof</div>
                    <div className="tbp-zone-formula">Roof Main &#215; 27% + Q4 AEMAC CWM</div>
                  </div>
                </div>
                <div className="tbp-zone-body">
                  <div className="tbp-metric"><span>Roof Main &#215; 27%</span><span>{fmt(zones.roof.roofShare)} kWh</span></div>
                  <div className="tbp-metric"><span>Q4 AEMAC CWM (direct)</span><span>{fmt(zones.roof.roofAemacKwh)} kWh</span></div>
                  <div className="tbp-metric tbp-metric-total"><span>Total roof</span><span>{fmt(zones.roof.kwh)} kWh</span></div>
                  <div className="tbp-zone-total">
                    <span>Zone cost</span>
                    <span className="tbp-amount">{fmtIls(zones.roof.ils)} ILS</span>
                  </div>
                </div>
              </div>

              <div className="tbp-zone-card">
                <div className="tbp-zone-header tbp-zone-parking">
                  <div className="tbp-zone-icon">&#128663;</div>
                  <div>
                    <div className="tbp-zone-name">Parking</div>
                    <div className="tbp-zone-formula">(PB Main &#8722; PB1 Main) &#215; 27%</div>
                  </div>
                </div>
                <div className="tbp-zone-body">
                  <div className="tbp-metric"><span>PB Main</span><span>{fmt(zones.parking.pbKwh)} kWh</span></div>
                  <div className="tbp-metric"><span>PB1 (charging — excluded)</span><span className="tbp-red">&#8722; {fmt(zones.parking.pb1Kwh)} kWh</span></div>
                  <div className="tbp-metric tbp-metric-total"><span>Net parking &#215; 27%</span><span>{fmt(zones.parking.kwh)} kWh</span></div>
                  <div className="tbp-zone-total">
                    <span>Zone cost</span>
                    <span className="tbp-amount">{fmtIls(zones.parking.ils)} ILS</span>
                  </div>
                </div>
              </div>
            </div>

            {zones.building.b0Kwh > 0 && (
              <div className="tbp-cmp-card">
                <div className="tbp-cmp-header">
                  <span className="tbp-cmp-title">Building consumption comparison</span>
                  <span className="tbp-cmp-sub">NeuReality vs B0 — Main (incl. PV)</span>
                </div>
                <div className="tbp-cmp-body">
                  <div className="tbp-cmp-stats">
                    <div className="tbp-cmp-stat">
                      <div className="tbp-cmp-stat-label"><span className="tbp-cmp-dot-neu" />NeuReality</div>
                      <div className="tbp-cmp-stat-kwh" style={{color:"#3fb950"}}>{fmt(zones.building.kwh)} kWh</div>
                      <div className="tbp-cmp-stat-ils">{fmtIls(zones.building.ils)} ILS</div>
                      <div className="tbp-cmp-stat-pct">{zones.building.sharePct}% of building</div>
                    </div>
                    <div className="tbp-cmp-divider" />
                    <div className="tbp-cmp-stat">
                      <div className="tbp-cmp-stat-label"><span className="tbp-cmp-dot-b0" />B0 + PV total</div>
                      <div className="tbp-cmp-stat-kwh" style={{color:"#e05060"}}>{fmt(zones.building.b0Kwh)} kWh</div>
                      <div className="tbp-cmp-stat-ils">{fmtIls(zones.building.b0Ils)} ILS</div>
                      <div className="tbp-cmp-stat-pct">100% of building</div>
                    </div>
                  </div>
                  <div className="tbp-cmp-pie">
                    {(() => {
                      const total = zones.building.b0Kwh || 1;
                      const neu = Math.min(zones.building.kwh || 0, total);
                      const pct = neu / total;
                      const angle = pct * 2 * Math.PI;
                      const CX = 70, CY = 70, R = 58;
                      const x1 = CX + R * Math.cos(-Math.PI/2);
                      const y1 = CY + R * Math.sin(-Math.PI/2);
                      const x2 = CX + R * Math.cos(-Math.PI/2 + angle);
                      const y2 = CY + R * Math.sin(-Math.PI/2 + angle);
                      const large = angle > Math.PI ? 1 : 0;
                      return (
                        <svg viewBox="0 0 140 140" width="130" height="130">
                          {pct >= 1 ? (
                            <circle cx={CX} cy={CY} r={R} fill="#1a5c2a" />
                          ) : (
                            <>
                              <circle cx={CX} cy={CY} r={R} fill="#7a0008" />
                              <path d={"M"+CX+","+CY+" L"+x1.toFixed(1)+","+y1.toFixed(1)+" A"+R+","+R+" 0 "+large+",1 "+x2.toFixed(1)+","+y2.toFixed(1)+" Z"} fill="#1a5c2a" />
                              <circle cx={CX} cy={CY} r={28} fill="#0f1216" />
                            </>
                          )}
                          <text x={CX} y={CY-6} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">{zones.building.sharePct}%</text>
                          <text x={CX} y={CY+10} textAnchor="middle" fill="#888" fontSize="10">NeuReality</text>
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div className="tbp-bottom-row">
              <div className="tbp-invoice-card">
                <div className="tbp-invoice-title">Invoice summary — {periodLabel}</div>
                <div className="tbp-invoice-grid">
                  <div className="tbp-inv-row"><span>Building (Q4 2nd Floor — direct)</span><span>{fmtIls(zones.building.ils)} ILS</span></div>
                  <div className="tbp-inv-row"><span>Roof (27% + AEMAC CWM)</span><span>{fmtIls(zones.roof.ils)} ILS</span></div>
                  <div className="tbp-inv-row"><span>Parking (PB &#8722; PB1) &#215; 27%</span><span>{fmtIls(zones.parking.ils)} ILS</span></div>
                  <div className="tbp-inv-divider" />
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
                      <svg viewBox="0 0 160 160" width="140" height="140">
                        {slices.map((s,i) => (
                          slices.length === 1
                            ? <circle key={i} cx={CX} cy={CY} r={R} fill={s.color} />
                            : <path key={i} d={"M"+CX+","+CY+" L"+s.x1+","+s.y1+" A"+R+","+R+" 0 "+s.large+",1 "+s.x2+","+s.y2+" Z"} fill={s.color} stroke="#0f1114" strokeWidth="2" />
                        ))}
                        <circle cx={CX} cy={CY} r={36} fill="#0f1114" />
                        <text x={CX} y={CY-4} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600">{fmtIls(totalIls)}</text>
                        <text x={CX} y={CY+10} textAnchor="middle" fill="#888" fontSize="8">ILS</text>
                      </svg>
                      <div className="tbp-pie-legend">
                        {slices.map((s,i) => (
                          <div key={i} className="tbp-pie-leg-item">
                            <span className="tbp-pie-leg-dot" style={{background:s.color}} />
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
                  <button className="tbp-export-btn" onClick={handleExport}>
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