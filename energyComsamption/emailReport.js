/**
 * emailReport.js
 * Generates and sends daily energy report email
 */

import nodemailer from "nodemailer";
import pg from "pg";
import puppeteer from "puppeteer";
import fs from "fs";
import pathModule from "path";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../EnergyDashboard/.env.unified") });

// Force IPv4 for all DNS lookups
import { setDefaultResultOrder } from "dns";
setDefaultResultOrder("ipv4first");

// Direct PostgreSQL connection
const pgPool = new pg.Pool({
  host:     process.env.PG_HOST,
  port:     Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || "postgres",
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  max:      5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

async function pgQuery(text, params = []) {
  const client = await pgPool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
}

// ── Save PDF to disk ──────────────────────────────────────
function savePdfToDisk(pdf, subFolder, filename) {
  try {
    const baseDir = "C:/EnergyReports";
    const dir = pathModule.join(baseDir, subFolder);
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    if (!fs.existsSync(dir))     fs.mkdirSync(dir,     { recursive: true });
    const fullPath = pathModule.join(dir, filename);
    fs.writeFileSync(fullPath, pdf);
    console.log(`💾 PDF saved to: ${fullPath}`);
    return fullPath;
  } catch (err) {
    console.error("❌ Failed to save PDF:", err.message);
  }
}

// ── Generate PDF from HTML ────────────────────────────────
async function generatePdf(html) {
  let browser;
  try {
    console.log("🚀 Launching browser...");
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!execPath) throw new Error("PUPPETEER_EXECUTABLE_PATH not set in .env.unified");
    console.log("🌐 Using browser:", execPath);
    browser = await puppeteer.launch({
      headless: true,
      executablePath: execPath,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-software-rasterizer"],
      timeout: 30000,
    });
    console.log("✅ Browser launched");
    const page = await browser.newPage();
    console.log("📄 Setting content...");
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
    console.log("🖨️ Generating PDF...");
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", right: "0", bottom: "10mm", left: "0" }, timeout: 15000 });
    console.log("✅ PDF generated, size:", pdf.length, "bytes");
    await page.close();
    return pdf;
  } catch (err) {
    console.error("❌ PDF generation failed:", err.message);
    throw err;
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }
}

// ── Breaker registry ──────────────────────────────────────
const ALL_BREAKERS = {
  1:  { id: 1,  name: "B0 — Main",       group: "B0",  color: "#CC0010" },
  22: { id: 22, name: "Roof — Main",      group: "Roof",color: "#f0a000" },
  27: { id: 27, name: "PB — Main",        group: "PB",  color: "#2255bb" },
  28: { id: 28, name: "PB1 — Main",       group: "PB1", color: "#7c3aed" },
  29: { id: 29, name: "PB1 — AC Charges", group: "PB1", color: "#a78bfa" },
  30: { id: 30, name: "PV Panels",        group: "PV",  color: "#1a7f37" },
};
const COLORS_LIST = ["#CC0010","#f0a000","#2255bb","#1a7f37","#7c3aed","#0891b2","#db2777","#f59e0b"];
const VAT_RATE  = Number(process.env.VAT_RATE || 0.18);
const SITE_NAME = process.env.LOCATION_NAME || "QESARIYYA";

// ── Date helpers ──────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0,10); }
function yesterdayStr() { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }
function lastWeekStr()  { const d=new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); }
function fmtDate(str) { return new Date(str).toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"}); }
function fmtNum(n) { return Math.round(n||0).toLocaleString(); }
function fmtIls(n) { return Math.round(n||0).toLocaleString(); }

// ── Date range by frequency ───────────────────────────────
function getDateRangeForFrequency(frequency) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2,"0");
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = fmt(now);
  if (frequency === "weekly")  { const f=new Date(now); f.setDate(now.getDate()-6);  return { from: fmt(f), to: today }; }
  if (frequency === "monthly") { const f=new Date(now); f.setDate(now.getDate()-29); return { from: fmt(f), to: today }; }
  return { from: today, to: today };
}

// ── Fetch breaker consumption ─────────────────────────────
async function getBreaker(id, from, to) {
  try {
    const tariffRows = await pgQuery("SELECT * FROM get_tariffs()");
    const tariffs = {};
    for (const r of tariffRows) { if (r.season) tariffs[r.season] = { off: Number(r.off_rate), peak: Number(r.peak_rate) }; }
    const raw = await pgQuery("SELECT * FROM get_consumption($1,$2,$3)", [id, new Date(from+"T00:00:00"), new Date(to+"T23:59:59")]);
    if (!raw || raw.length===0) return { kwh:0, ils:0, peak_kwh:0, off_kwh:0 };
    const sorted = raw.map(r=>({ ae: Number(r.activeenergy??r.ActiveEnergy??0), ts: new Date(r.ts??r.timestamp) })).sort((a,b)=>a.ts-b.ts);
    let kwh=0, peak_kwh=0, off_kwh=0, ils=0;
    for (let i=1; i<sorted.length; i++) {
      const delta = sorted[i].ae - sorted[i-1].ae;
      if (delta<=0) continue;
      const h=sorted[i].ts.getHours(), day=sorted[i].ts.getDay(), month=sorted[i].ts.getMonth()+1;
      const isSunThu=day>=0&&day<=4;
      const season=(month===12||month<=2)?"winter":(month>=6&&month<=9)?"summer":"shoulder";
      const isPeak=isSunThu&&h>=17&&h<22;
      const rate=isPeak?tariffs[season].peak:tariffs[season].off;
      kwh+=delta; ils+=delta*rate;
      if (isPeak) peak_kwh+=delta; else off_kwh+=delta;
    }
    return { kwh:Math.round(kwh), ils:Math.round(ils*100)/100, peak_kwh:Math.round(peak_kwh), off_kwh:Math.round(off_kwh) };
  } catch (err) {
    console.error(`Error fetching breaker ${id}:`, err.message);
    return { kwh:0, ils:0, peak_kwh:0, off_kwh:0 };
  }
}

// ── Build report data ─────────────────────────────────────
async function buildReportData(fromDate, toDate, customBreakerIds=null) {
  const yStr=yesterdayStr(), lwStr=lastWeekStr();
  const selectedIds = customBreakerIds || [1,22,27,30];
  const activeBreakers = selectedIds.map((id,i)=>ALL_BREAKERS[id]||{id,name:`Breaker ${id}`,group:`B${id}`,color:COLORS_LIST[i%COLORS_LIST.length]}).map((b,i)=>({...b,color:b.color||COLORS_LIST[i%COLORS_LIST.length]}));
  const mainData=[]; for (const b of activeBreakers) mainData.push(await getBreaker(b.id,fromDate,toDate));
  const yData=[];    for (const b of activeBreakers) yData.push(await getBreaker(b.id,yStr,yStr));
  const lwData=[];   for (const b of activeBreakers) lwData.push(await getBreaker(b.id,lwStr,lwStr));
  const panels=activeBreakers.map((b,i)=>({...b,...mainData[i]}));
  const totalKwh=panels.reduce((s,p)=>s+p.kwh,0), totalIls=panels.reduce((s,p)=>s+p.ils,0);
  const totalPeak=panels.reduce((s,p)=>s+p.peak_kwh,0), totalOff=panels.reduce((s,p)=>s+p.off_kwh,0);
  const yTotalKwh=yData.reduce((s,d)=>s+d.kwh,0), lwTotalKwh=lwData.reduce((s,d)=>s+d.kwh,0);
  const vsYesterday=yTotalKwh>0?((totalKwh-yTotalKwh)/yTotalKwh)*100:null;
  const vsLastWeek=lwTotalKwh>0?((totalKwh-lwTotalKwh)/lwTotalKwh)*100:null;
  const has27=selectedIds.includes(27), has28=selectedIds.includes(28), has29=selectedIds.includes(29);
  const pb1Main=has28?await getBreaker(28,fromDate,toDate):null;
  const pb1Ac=has29?await getBreaker(29,fromDate,toDate):null;
  const pb1Other=pb1Main&&pb1Ac?Math.max(0,pb1Main.kwh-pb1Ac.kwh):null;
  const pbDirect=has27&&has28?Math.max(0,(panels.find(p=>p.id===27)?.kwh||0)-(pb1Main?.kwh||0)):null;
  return { panels,totalKwh,totalIls,totalPeak,totalOff,vsYesterday,vsLastWeek,yTotalKwh,lwTotalKwh,pb1Main,pb1Ac,pb1Other,pbDirect,has27,has28,has29,dateStr:`${fromDate} → ${toDate}`,frequency:"daily" };
}

// ── Build HTML ────────────────────────────────────────────
function buildHtml(d) {
  const freqLabel={daily:"Daily Report",weekly:"Weekly Report",monthly:"Monthly Report"};
  const reportTypeLabel=freqLabel[d.frequency]||"Daily Report";
  const fmtPct=(n)=>n==null?"—":`${n>0?"+":""}${n.toFixed(1)}%`;
  const pctColor=(n)=>n==null?"#555":n<=0?"#1a7f37":"#CC0010";
  const trendArrow=(n)=>n==null?"":n<=0?"↓":"↑";
  const peakPct=d.totalKwh>0?Math.round((d.totalPeak/d.totalKwh)*100):0;
  let startAngle=-Math.PI/2;
  const pieSlices=d.panels.filter(p=>p.kwh>0).map(p=>{
    const pct=p.kwh/d.totalKwh, angle=pct*2*Math.PI;
    const x1=70+63*Math.cos(startAngle), y1=70+63*Math.sin(startAngle);
    const x2=70+63*Math.cos(startAngle+angle), y2=70+63*Math.sin(startAngle+angle);
    const large=angle>Math.PI?1:0;
    const slice=`<path d="M70,70 L${x1.toFixed(1)},${y1.toFixed(1)} A63,63 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${p.color}"/>`;
    startAngle+=angle; return slice;
  });
  const costCards=d.panels.map(p=>`<div class="cost-card"><div class="cost-top" style="background:${p.color}11"><div class="cost-tag" style="color:${p.color}">${p.group}</div><div class="cost-name">${p.name}</div><div class="cost-ils" style="color:${p.color}">${fmtIls(p.ils)}<span class="cost-unit">ILS</span></div><div class="cost-vat">+VAT: ${fmtIls(p.ils*(1+VAT_RATE))} ILS</div></div><div class="cost-bot"><span class="cost-kwh">${fmtNum(p.kwh)} kWh</span><span class="cost-pct">${d.totalKwh>0?Math.round(p.kwh/d.totalKwh*100):0}%</span></div></div>`).join("");
  const pieLegend=d.panels.map(p=>`<div class="pie-row"><div class="pie-dot" style="background:${p.color}"></div><div class="pie-name">${p.name}</div><div class="pie-bar"><div class="pie-fill" style="width:${d.totalKwh>0?Math.round(p.kwh/d.totalKwh*100):0}%;background:${p.color}"></div></div><div class="pie-kwh">${fmtNum(p.kwh)} kWh</div><div class="pie-pct">${d.totalKwh>0?Math.round(p.kwh/d.totalKwh*100):0}%</div></div>`).join("");
  const tableRows=d.panels.map(p=>{const pct=d.totalKwh>0?Math.round(p.kwh/d.totalKwh*100):0;return `<tr><td><span style="background:${p.color}22;color:${p.color};display:inline-block;padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700">${p.group}</span> ${p.name}</td><td style="font-weight:700">${fmtNum(p.kwh)}</td><td style="font-weight:700;color:${p.color}">${fmtIls(p.ils)}</td><td style="color:#aaa">${fmtIls(p.ils*(1+VAT_RATE))}</td><td style="color:#CC0010;font-weight:600">${fmtNum(p.peak_kwh)}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fg" style="width:${pct}%;background:${p.color}"></div></div><span style="font-size:10px;color:#aaa">${pct}%</span></div></td><td style="color:#aaa">—</td></tr>`;}).join("");
  const pbTree=(d.has28||d.has29)?`<div class="sec"><div class="sec-label">PB sub-panel hierarchy</div><div class="sec-line"></div></div><div class="pb-tree"><div class="pb-tree-title">Power distribution tree</div>${d.has27?`<div class="pb-l1"><span style="width:8px;height:8px;border-radius:2px;background:#2255bb;display:inline-block;flex-shrink:0"></span><span class="pb-name">PB — Main Breaker</span><span class="pb-kwh">${fmtNum(d.panels.find(p=>p.id===27)?.kwh||0)} kWh</span><span class="pb-ils">${fmtIls(d.panels.find(p=>p.id===27)?.ils||0)} ILS</span><span class="pb-badge">Br.27</span></div>`:""}<div style="padding-left:14px;border-left:1px solid #1a1d22;margin-left:6px">${d.has27&&d.has28&&d.pbDirect!==null?`<div class="pb-l2"><span style="width:6px;height:6px;border-radius:1px;background:#334;display:inline-block;flex-shrink:0"></span><span class="pb-l2-name">PB direct load</span><span class="pb-l2-kwh">${fmtNum(d.pbDirect)} kWh</span><span class="pb-ils">${fmtIls(d.pbDirect*0.3945)} ILS</span><span class="pb-badge" style="font-size:8px;color:#333">27−28</span></div>`:""}${d.has28&&d.pb1Main?`<div class="pb-l2"><span style="width:6px;height:6px;border-radius:1px;background:#7c3aed;display:inline-block;flex-shrink:0"></span><span class="pb-l2-name" style="color:#a78bfa">PB1 — Charging sub-panel</span><span class="pb-l2-kwh" style="color:#a78bfa">${fmtNum(d.pb1Main.kwh)} kWh</span><span class="pb-ils">${fmtIls(d.pb1Main.ils)} ILS</span><span class="pb-badge" style="font-size:8px;color:#555">Br.28</span></div>`:""}${d.has29&&d.pb1Ac?`<div style="padding-left:13px;border-left:1px dashed #1e2025;margin-left:3px"><div class="pb-l3"><span style="width:5px;height:5px;border-radius:1px;background:#4c1d95;display:inline-block;flex-shrink:0"></span><span class="pb-l3-name">AC Charging stations</span><span class="pb-l3-kwh">${fmtNum(d.pb1Ac.kwh)} kWh · ${fmtIls(d.pb1Ac.ils)} ILS</span><span class="pb-badge" style="font-size:8px;color:#333">Br.29</span></div>${d.pb1Other!==null?`<div class="pb-l3"><span style="width:5px;height:5px;border-radius:1px;background:#2d1a4a;display:inline-block;flex-shrink:0"></span><span class="pb-l3-name">Other PB1 loads</span><span class="pb-l3-kwh">${fmtNum(d.pb1Other)} kWh · ${fmtIls(d.pb1Other*0.3945)} ILS</span><span class="pb-badge" style="font-size:8px;color:#333">28−29</span></div>`:""}</div>`:""}</div></div>`:"";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif}
.wrap{max-width:640px;margin:0 auto;background:#fff}
.hdr{background:#0a0c0f}.hdr-stripe{height:3px;background:#CC0010}
.hdr-inner{padding:24px 32px;display:flex;align-items:center;justify-content:space-between}
.hdr-logo{font-size:32px;font-weight:900;color:#fff;letter-spacing:4px}
.hdr-logomark{font-size:9px;color:#ff4444;letter-spacing:3px;text-transform:uppercase;margin-top:2px}
.hdr-badge{background:rgba(204,0,16,0.15);border:1px solid rgba(204,0,16,0.3);border-radius:4px;padding:3px 10px;font-size:9px;color:#CC0010;letter-spacing:2px;font-weight:700;margin-bottom:6px;display:inline-block}
.hdr-title{font-size:17px;font-weight:600;color:#fff}.hdr-meta{font-size:11px;color:#aaa;margin-top:2px}
.ts-bar{background:#111316;padding:7px 32px;display:flex;justify-content:space-between;border-bottom:1px solid #1a1d22}
.ts-item{font-size:10px;color:#bbb;font-weight:500;letter-spacing:1px;text-transform:uppercase}
.ts-item span{color:#fff;font-weight:700}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #eee}
.kpi-cell{padding:16px 18px;border-right:1px solid #f0f0f0;position:relative}.kpi-cell:last-child{border-right:none}
.kpi-cell::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.kpi-c1::before{background:#CC0010}.kpi-c2::before{background:#2255bb}.kpi-c3::before{background:#1a7f37}.kpi-c4::before{background:#f0a000}
.kpi-label{font-size:9px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px}
.kpi-val{font-size:22px;font-weight:700;line-height:1;color:#111}.kpi-unit{font-size:10px;color:#aaa;font-weight:400;margin-left:2px}.kpi-sub{font-size:10px;color:#999;margin-top:3px}
.body{padding:24px 32px}
.sec{display:flex;align-items:center;gap:8px;margin:20px 0 14px}.sec:first-child{margin-top:0}
.sec-line{flex:1;height:0.5px;background:#e8e8e8}
.sec-label{font-size:9px;color:#CC0010;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;white-space:nowrap}
.cost-grid{display:grid;grid-template-columns:repeat(${Math.min(d.panels.length,4)},1fr);gap:8px;margin-bottom:10px}
.cost-card{border-radius:6px;overflow:hidden;border:0.5px solid #eee}
.cost-top{padding:11px 12px 9px}.cost-tag{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px}
.cost-name{font-size:10px;color:#555;margin-bottom:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cost-ils{font-size:22px;font-weight:700;line-height:1}.cost-unit{font-size:10px;font-weight:400;color:#aaa;margin-left:2px}.cost-vat{font-size:9px;color:#aaa;margin-top:2px}
.cost-bot{background:#f9f9f9;padding:6px 12px;border-top:0.5px solid #eee;display:flex;justify-content:space-between;font-size:10px}.cost-kwh{color:#888;font-weight:600}.cost-pct{color:#bbb}
.total-row{background:#0f1114;border-radius:6px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.total-label{font-size:9px;color:#aaa;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:3px}
.total-val{font-size:24px;font-weight:700;color:#fff}.total-unit{font-size:12px;color:#aaa;margin-left:4px}.total-vat{font-size:10px;color:#aaa;margin-top:2px}.total-kwh{font-size:12px;color:#aaa}.total-trend{font-size:12px;font-weight:700;margin-top:2px}
.pie-wrap{display:flex;align-items:center;gap:20px;background:#fafafa;border:0.5px solid #eee;border-radius:8px;padding:16px 20px;margin-bottom:6px}
.pie-legend{display:flex;flex-direction:column;gap:8px;flex:1}.pie-row{display:flex;align-items:center;gap:8px}.pie-dot{width:9px;height:9px;border-radius:2px;flex-shrink:0}
.pie-name{flex:1;font-size:11px;color:#444;font-weight:500}.pie-bar{width:60px;height:3px;background:#eee;border-radius:2px;overflow:hidden}.pie-fill{height:100%;border-radius:2px}
.pie-kwh{font-size:12px;font-weight:700;color:#111;min-width:56px;text-align:right}.pie-pct{font-size:10px;color:#bbb;min-width:26px;text-align:right}
.panel-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px}
.panel-tbl th{font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:1.5px;padding:7px 10px;background:#fafafa;border-bottom:1px solid #eee;border-top:1px solid #eee;text-align:left}
.panel-tbl td{padding:9px 10px;border-bottom:0.5px solid #f5f5f5;color:#333;vertical-align:middle}.panel-tbl tr:last-child td{border-bottom:none}
.bar-wrap{display:flex;align-items:center;gap:6px}.bar-bg{width:50px;height:3px;background:#eee;border-radius:2px;overflow:hidden}.bar-fg{height:100%;border-radius:2px}
.pb-tree{background:#0f1114;border-radius:8px;padding:16px 20px}.pb-tree-title{font-size:9px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px}
.pb-l1{display:flex;align-items:baseline;gap:8px;padding:6px 0;border-bottom:0.5px solid #1a1d22}
.pb-l2{display:flex;align-items:baseline;gap:8px;padding:5px 0;padding-left:16px;border-left:1px solid #1a1d22;margin-left:6px}
.pb-l3{display:flex;align-items:baseline;gap:8px;padding:4px 0 4px 14px;border-left:1px dashed #1a1d22;margin-left:3px}
.pb-name{flex:1;font-size:12px;color:#ccc;font-weight:500}.pb-kwh{font-size:12px;font-weight:700;color:#fff}.pb-ils{font-size:10px;color:#888;margin-left:4px}
.pb-badge{font-size:8px;color:#aaa;background:#1a1d22;border:0.5px solid #2a2d32;border-radius:3px;padding:1px 5px}
.pb-l2-name{flex:1;font-size:11px;color:#bbb}.pb-l2-kwh{font-size:12px;color:#aaa;font-weight:500}.pb-l3-name{flex:1;font-size:10px;color:#aaa}.pb-l3-kwh{font-size:11px;color:#aaa}
.cmp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cmp-box{border:0.5px solid #eee;border-radius:6px;padding:13px 16px;position:relative;overflow:hidden}
.cmp-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.cmp-y::before{background:#1a7f37}.cmp-w::before{background:#2255bb}
.cmp-label{font-size:9px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px}.cmp-val{font-size:24px;font-weight:700}.cmp-ref{font-size:10px;color:#999;margin-top:3px}
.peak-alert{background:#0f1114;border:0.5px solid #1e2025;border-left:3px solid #CC0010;border-radius:6px;padding:11px 14px;display:flex;gap:10px;margin-bottom:6px}
.peak-icon{width:24px;height:24px;background:rgba(204,0,16,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
.peak-text{font-size:11px;color:#ccc;line-height:1.6}.peak-text strong{color:#fff;font-weight:700}
.ftr{background:#0a0c0f;border-top:1px solid #111316;padding:13px 32px;display:flex;justify-content:space-between}
.ftr-left{font-size:10px;color:#aaa;line-height:1.6}.ftr-left span{color:#CC0010;font-weight:600}.ftr-right{font-size:9px;color:#aaa;text-align:right}
</style></head><body>
<div class="wrap">
  <div class="hdr"><div class="hdr-stripe"></div><div class="hdr-inner"><div><div class="hdr-logo">ABB</div><div class="hdr-logomark">Energy Monitoring System</div></div><div style="text-align:right"><div class="hdr-badge">ABB · ${reportTypeLabel}</div><div class="hdr-title">Energy Summary</div><div class="hdr-meta">${fmtDate(d.dateStr.split(" → ")[0])} · ${SITE_NAME}</div></div></div></div>
  <div class="ts-bar"><div class="ts-item">OPC UA · <span>${d.panels.length} panels</span></div><div class="ts-item">Generated: <span>${new Date().toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"})} IDT</span></div><div class="ts-item">Period: <span>${d.dateStr}</span></div></div>
  <div class="kpi-row">
    <div class="kpi-cell kpi-c1"><div class="kpi-label">Total consumption</div><div class="kpi-val">${fmtNum(d.totalKwh)}<span class="kpi-unit">kWh</span></div><div class="kpi-sub">${d.panels.length} panels</div></div>
    <div class="kpi-cell kpi-c2"><div class="kpi-label">Cost (excl. VAT)</div><div class="kpi-val">${fmtIls(d.totalIls)}<span class="kpi-unit">ILS</span></div><div class="kpi-sub">+18% = ${fmtIls(d.totalIls*(1+VAT_RATE))} ILS</div></div>
    <div class="kpi-cell kpi-c3"><div class="kpi-label">vs Yesterday</div><div class="kpi-val" style="color:${pctColor(d.vsYesterday)}">${fmtPct(d.vsYesterday)}</div><div class="kpi-sub">${fmtNum(d.yTotalKwh)} kWh yesterday</div></div>
    <div class="kpi-cell kpi-c4"><div class="kpi-label">Peak hours</div><div class="kpi-val">${fmtNum(d.totalPeak)}<span class="kpi-unit">kWh</span></div><div class="kpi-sub">${peakPct}% · 17:00–22:00</div></div>
  </div>
  <div class="body">
    <div class="peak-alert"><div class="peak-icon">⚡</div><div class="peak-text"><strong>Peak hours:</strong> ${fmtNum(d.totalPeak)} kWh during peak (17:00–22:00). Off-peak: <strong>${fmtNum(d.totalOff)} kWh</strong></div></div>
    <div class="sec"><div class="sec-label">Cost per panel</div><div class="sec-line"></div></div>
    <div class="cost-grid">${costCards}</div>
    <div class="total-row"><div><div class="total-label">Total cost</div><div style="display:flex;align-items:baseline;gap:6px;margin-top:4px"><span class="total-val">${fmtIls(d.totalIls)}</span><span class="total-unit">ILS</span></div><div class="total-vat">Including VAT (18%): ${fmtIls(d.totalIls*(1+VAT_RATE))} ILS</div></div><div style="text-align:right"><div class="total-kwh">${fmtNum(d.totalKwh)} kWh total</div><div class="total-trend" style="color:${pctColor(d.vsYesterday)}">${trendArrow(d.vsYesterday)} ${Math.abs((d.vsYesterday||0)).toFixed(1)}% vs yesterday</div></div></div>
    <div class="sec"><div class="sec-label">Consumption breakdown</div><div class="sec-line"></div></div>
    <div class="pie-wrap"><svg width="140" height="140" viewBox="0 0 140 140">${pieSlices.length?pieSlices.join(""):`<circle cx="70" cy="70" r="63" fill="#eee"/>`}<circle cx="70" cy="70" r="35" fill="#fff"/><text x="70" y="66" text-anchor="middle" font-size="14" font-weight="700" fill="#111">${fmtNum(d.totalKwh)}</text><text x="70" y="79" text-anchor="middle" font-size="9" fill="#aaa">kWh</text></svg><div class="pie-legend">${pieLegend}</div></div>
    <div class="sec"><div class="sec-label">Panel details</div><div class="sec-line"></div></div>
    <table class="panel-tbl"><thead><tr><th>Panel</th><th>kWh</th><th>ILS</th><th>+VAT</th><th>Peak kWh</th><th>Share</th><th>vs Yest.</th></tr></thead><tbody>${tableRows}</tbody></table>
    ${pbTree}
    <div class="sec" style="margin-top:20px"><div class="sec-label">Performance comparison</div><div class="sec-line"></div></div>
    <div class="cmp-grid"><div class="cmp-box cmp-y"><div class="cmp-label">vs Yesterday</div><div class="cmp-val" style="color:${pctColor(d.vsYesterday)}">${fmtPct(d.vsYesterday)}</div><div class="cmp-ref">${fmtNum(d.yTotalKwh)} kWh yesterday</div></div><div class="cmp-box cmp-w"><div class="cmp-label">vs Last week</div><div class="cmp-val" style="color:${pctColor(d.vsLastWeek)}">${fmtPct(d.vsLastWeek)}</div><div class="cmp-ref">${fmtNum(d.lwTotalKwh)} kWh last week</div></div></div>
  </div>
  <div class="ftr"><div class="ftr-left"><span>ABB Energy Monitoring</span> · ${SITE_NAME}<br>OPC UA · SQL Server · Supabase · ABB</div><div class="ftr-right">Auto-generated · ${new Date().toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"})} IDT<br>Do not reply</div></div>
</div></body></html>`;
}

// ── Create transporter ────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_API_KEY },
    socketTimeout: 30000,
    greetingTimeout: 15000,
    connectionTimeout: 15000,
    family: 4,
  });
}

// ── Scheduler ─────────────────────────────────────────────
export function scheduleDailyReport() {
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(23,30,0,0);
    if (next<=now) next.setDate(next.getDate()+1);
    const ms = next - now;
    console.log(`📅 Next daily report scheduled at ${next.toLocaleString("he-IL")}`);
    setTimeout(async () => {
      try {
        const today = todayStr();
        const { from, to } = getDateRangeForFrequency("daily");
        const d = await buildReportData(from, to);
        d.frequency = "daily";
        const html = buildHtml(d);
        const pdf = await generatePdf(html);
        const ts = new Date().toTimeString().slice(0,8).replace(/:/g,"-");
        const filename = `ABB-Energy-Daily-${today}_${ts}.pdf`;
        savePdfToDisk(pdf, "today", filename);
        const recipients = (process.env.EMAIL_RECIPIENTS||"haimhuber90@gmail.com").split(",").map(e=>e.trim()).filter(Boolean);
        const transporter = createTransporter();
        const info = await transporter.sendMail({
          from: `"ABB Energy Monitoring" <${process.env.EMAIL_USER}>`,
          to: recipients.join(", "),
          subject: `⚡ Energy Daily Report — ${today} — ${d.totalKwh.toLocaleString()} kWh`,
          html: `<p>Please find attached the daily energy report for <strong>${today}</strong>.</p><p>Total: <strong>${d.totalKwh.toLocaleString()} kWh</strong> | Cost: <strong>${Math.round(d.totalIls).toLocaleString()} ILS</strong></p><br><p style="color:#888;font-size:11px">ABB Energy Monitoring · ${SITE_NAME}</p>`,
          attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
        });
        console.log(`✅ Daily report sent — ${info.messageId}`);
      } catch (err) { console.error("Report error:", err.message); }
      scheduleNext();
    }, ms);
  }
  scheduleNext();
}

// ── Exported functions ────────────────────────────────────
export async function buildReportHtml({ breaker_ids, frequency, name }) {
  const { from, to } = getDateRangeForFrequency(frequency || "daily");
  const d = await buildReportData(from, to, breaker_ids);
  d.frequency = frequency || "daily";
  return buildHtml(d);
}

export async function sendScheduledReport(schedule) {
  const today = todayStr();
  const { from, to } = getDateRangeForFrequency(schedule.frequency || "daily");
  const d = await buildReportData(from, to, schedule.breaker_ids);
  d.frequency = schedule.frequency || "daily";
  const html = buildHtml(d);
  console.log("📄 Generating PDF...");
  const pdf = await generatePdf(html);
  const safeName = schedule.name.replace(/[^a-zA-Z0-9-_]/g,"-");
  const ts = new Date().toTimeString().slice(0,8).replace(/:/g,"-");
  const filename = `ABB-Energy-Report-${safeName}-${today}_${ts}.pdf`;
  savePdfToDisk(pdf, "send-now", filename);
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"ABB Energy Monitoring" <${process.env.EMAIL_USER}>`,
    to: schedule.recipients.join(", "),
    subject: `⚡ ${schedule.name} — ${today} — ${d.totalKwh.toLocaleString()} kWh`,
    html: `<p>Please find attached: <strong>${schedule.name}</strong> for <strong>${today}</strong>.</p><p>Total: <strong>${d.totalKwh.toLocaleString()} kWh</strong> | Cost: <strong>${Math.round(d.totalIls).toLocaleString()} ILS</strong></p><br><p style="color:#888;font-size:11px">ABB Energy Monitoring · ${SITE_NAME}</p>`,
    attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
  });
  console.log(`✅ Scheduled report "${schedule.name}" sent to ${schedule.recipients.join(", ")}`);
  return { filename, path: `C:/EnergyReports/send-now/${filename}` };
}

// ── Run directly ──────────────────────────────────────────
const isMain = process.argv[1]?.endsWith("emailReport.js");
if (isMain) {
  const { from, to } = getDateRangeForFrequency("daily");
  buildReportData(from, to).then(async d => {
    d.frequency = "daily";
    const html = buildHtml(d);
    const pdf = await generatePdf(html);
    savePdfToDisk(pdf, "today", `test-${todayStr()}.pdf`);
    console.log("✅ Done");
    process.exit(0);
  }).catch(err => { console.error(err); process.exit(1); });
}