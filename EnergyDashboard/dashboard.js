// server.js
import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import Papa from "papaparse";
import cors from "cors";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
dotenv.config({ path: './.env.unified' });
import breakersConfig from "../energyComsamption/breakerConfig.json" with { type: "json" };
import db from "../energyComsamption/db.js";
import citiesConfig from "./public/cities.json" with { type: "json" };
import { registerReportScheduleRoutes } from "./report-schedules-routes.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ   = "Asia/Jerusalem";
const PORT = Number(process.env.PORT || 8000);
const CSV_DIR  = process.env.CSV_DIR  || "C:\\Energy";
const CSV_FILE = process.env.CSV_FILE || "energyData.csv";
const CSV_PATH = path.join(CSV_DIR, CSV_FILE);
const PUBLIC_DIR = path.join(process.cwd(), "public");
const DB_DRIVER  = process.env.DB_DRIVER || "mssql";

// =========================
// 2) Breakers
// =========================
const breakerRows = await db.getBreakerNamesInitial();
const BREAKERS = Object.fromEntries(
  breakerRows.map((row) => {
    const sid = String(row.id).trim();
    const sname = String(row.name || "").trim();
    const sdisplayName = String(row.displayName || "").trim();
    return [sid, { id: sid, name: sname || `Breaker ${sid}`, displayName: sdisplayName || `${sid} - ${sname}` }];
  })
);

// =========================
// 3) Tariffs
// =========================
const TARIFFS = await db.getTariffs();
let vatRate = 0.18;

// =========================
// 4) Auth
// =========================
const COOKIE_NAME = "token";
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not defined");
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = "30m";

function cookieOptions(req) {
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  return { httpOnly: true, secure: isHttps, sameSite: "lax", path: "/", maxAge: 30 * 60 * 1000 };
}
function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
function getUserFromReq(req) {
  try { const token = req.cookies?.[COOKIE_NAME]; if (!token) return null; return jwt.verify(token, JWT_SECRET); } catch { return null; }
}
function authRequired(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ detail: "Unauthorized" });
  req.user = user; next();
}

// =========================

// 5) Network
// =========================
function getAllLanIps() {
  const nets = os.networkInterfaces(); const ips = [];
  for (const name of Object.keys(nets)) for (const net of nets[name] || []) if (net && net.family === "IPv4" && !net.internal) ips.push({ name, ip: net.address });
  return ips;
}
function pickPreferredIp() {
  if (process.env.HOST_IP?.trim()) return process.env.HOST_IP.trim();
  const all = getAllLanIps();
  return (all.find(x => x.ip.startsWith("192.168.1.")) || all[0])?.ip || "127.0.0.1";
}

// =========================
// 6) CSV
// =========================
function safeReadCsvText() {
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV not found: ${CSV_PATH}`);
  let txt = fs.readFileSync(CSV_PATH, "utf8");
  if (txt && txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  return txt;
}
function normalizeRowFields(r) {
  const breakerId = r?.BreakerId ?? r?.breakerId ?? r?.breaker_id ?? r?.breaker ?? r?.id;
  const activeEnergy = r?.ActiveEnergy ?? r?.activeEnergy ?? r?.active_energy ?? r?.energy;
  const tsRaw = r?.timestamp ?? r?.time ?? r?.date;
  if (breakerId == null || activeEnergy == null || !tsRaw) return null;
  let tsStr = String(tsRaw).trim();
  if (tsStr.endsWith("Z")) tsStr = tsStr.replace(/Z$/, "");
  const t = dayjs.tz(tsStr, TZ);
  if (!t.isValid()) return null;
  const bid = Number(breakerId); const ae = Number(String(activeEnergy).trim().replace(/,/g, ""));
  if (!Number.isFinite(bid) || bid <= 0 || !Number.isFinite(ae)) return null;
  return { breakerId: bid, activeEnergy: ae, timestamp: t };
}
function parseCsvRowsFallback3cols(csvText) {
  const lines = String(csvText || "").split(/\r?\n/); const out = []; const bad = [];
  if (!lines.length) return { rows: [], bad };
  const header = (lines[0] || "").trim().toLowerCase();
  if (!header.startsWith("breakerid")) throw new Error(`CSV header invalid. First line: "${lines[0] || ""}"`);
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]; if (!raw || !raw.trim()) continue;
    const commas = (raw.match(/,/g) || []).length;
    if (commas !== 2) { bad.push({ lineNo: i + 1, reason: `commas=${commas}`, raw }); continue; }
    const [bidStr, aeStr, tsStr] = raw.split(",");
    const norm = normalizeRowFields({ BreakerId: bidStr?.trim(), ActiveEnergy: aeStr?.trim(), timestamp: tsStr?.trim() });
    if (!norm) { bad.push({ lineNo: i + 1, reason: "invalid fields", raw }); continue; }
    out.push(norm);
  }
  return { rows: out, bad };
}
function parseCsvRows(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const errors = parsed.errors || [];
  if (errors.some(e => String(e?.message || "").toLowerCase().includes("too many fields"))) {
    const { rows, bad } = parseCsvRowsFallback3cols(csvText);
    if (bad.length) console.warn(`[CSV WARN] fallback3cols. Skipped ${bad.length} bad line(s).`);
    return rows;
  }
  if (errors.length) throw new Error(`CSV parse errors: ${errors.slice(0,5).map(e=>e.message).join(" | ")}`);
  const out = []; let skipped = 0;
  for (const r of parsed.data || []) { const norm = normalizeRowFields(r); if (!norm) { skipped++; continue; } out.push(norm); }
  if (skipped) console.warn(`[CSV WARN] skipped ${skipped} row(s).`);
  return out;
}

// =========================
// 7) Tariff helpers
// =========================
function getSeason(t) { const m = t.month()+1; if (m===12||m===1||m===2) return "winter"; if (m>=6&&m<=9) return "summer"; return "shoulder"; }
function isPeak(t) {
  const hour = t.hour(); const season = getSeason(t); const d = t.day(); const isSunThu = d>=0&&d<=4;
  if (season==="summer") { if (!isSunThu) return false; return hour>=17&&hour<23; }
  if (season==="winter") return hour>=17&&hour<22;
  if (!isSunThu) return false; return hour>=17&&hour<22;
}
function getRateNisPerKwh(t, peak) {
  const season = getSeason(t);
  const tariffs = arguments.length > 2 ? arguments[2] : TARIFFS;
  return peak ? tariffs[season].peak : tariffs[season].off;
}
function rangeToBounds(fromDate, toDate) {
  const from = dayjs.tz(fromDate, TZ).startOf("day"); const to = dayjs.tz(toDate, TZ).endOf("day");
  if (!from.isValid() || !to.isValid()) throw new Error("Invalid date range");
  if (from.isAfter(to)) throw new Error('"from_date" must be <= "to_date"');
  return { from, to };
}
function computeDeltas(sortedRows, tariffs) {
  const out = []; let prev = null;
  for (const row of sortedRows) {
    if (!prev) { prev = row; continue; }
    const delta = row.activeEnergy - prev.activeEnergy;
    if (!Number.isFinite(delta) || delta <= 0) { prev = row; continue; }
    const peak = isPeak(row.timestamp); const rate = getRateNisPerKwh(row.timestamp, peak, tariffs);
    out.push({ ts: row.timestamp, kwh: delta, peak, season: getSeason(row.timestamp), rate, amount: delta * rate });
    prev = row;
  }
  return out;
}
function round3(n) { return Math.round(n * 1000) / 1000; }
function buildInvoiceNo() { return `INV-${dayjs().tz(TZ).format("YYYYMMDD-HHmmss")}`; }

// =========================
// 8) App
// =========================
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(PUBLIC_DIR, { index: false }));

// =========================
// 9) UI Routes
// =========================
app.get("/", (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// // =========================
// // 10) AI Query
// // =========================
// const MSSQL_PROMPT = `
// You generate SQL Server queries for energy analysis.
// Rules:
// 1. EnergyData.ActiveEnergy is cumulative. Never SUM directly.
// 2. Consumption = differences between consecutive readings using LAG().
// 3. Use SQL Server syntax only. Return ONLY raw SQL. No markdown. No backticks.
// 4. Only SELECT or WITH...SELECT queries.
// 5. [timestamp] is stored in correct local Israel time. Use GETDATE() for current time.
// 6. Use [timestamp] with brackets. Ignore negative deltas.
// 7. Use aliases: total_consumption_today, daily_consumption, etc.

// Schema: Table EnergyData — BreakerId INT, ActiveEnergy FLOAT, [timestamp] DATETIME2

// Example:
// WITH h AS (SELECT BreakerId,[timestamp],ActiveEnergy-LAG(ActiveEnergy)OVER(PARTITION BY BreakerId ORDER BY [timestamp])AS Consumption FROM EnergyData)
// SELECT BreakerId,CAST([timestamp]AS DATE)AS day,SUM(Consumption)AS daily_consumption FROM h WHERE Consumption>=0 GROUP BY BreakerId,CAST([timestamp]AS DATE) ORDER BY day;
// `;

// const PG_PROMPT = `
// You generate PostgreSQL queries for energy analysis.
// Rules:
// 1. energydata.activeenergy is cumulative. Never SUM directly.
// 2. Consumption = differences between consecutive readings using LAG().
// 3. Use PostgreSQL syntax only. Return ONLY raw SQL. No markdown. No backticks.
// 4. Only SELECT or WITH...SELECT queries.
// 5. ts column is stored in correct local Israel time. Use NOW() for current time.
// 6. Column names are lowercase: breakerid, activeenergy, ts. Ignore negative deltas.
// 7. Use aliases: total_consumption_today, daily_consumption, etc.

// Schema: Table energydata — breakerid INT, activeenergy FLOAT, ts TIMESTAMP

// Example:
// WITH h AS (SELECT breakerid,ts,activeenergy-LAG(activeenergy)OVER(PARTITION BY breakerid ORDER BY ts)AS consumption FROM energydata)
// SELECT breakerid,ts::date AS day,SUM(consumption)AS daily_consumption FROM h WHERE consumption>=0 GROUP BY breakerid,ts::date ORDER BY day;
// `;

// app.post("/api/ai-query", authRequired, async (req, res) => {
//   const { question } = req.body;
//   if (!question || typeof question !== "string") return res.status(400).json({ error: "Missing question" });

//   try {
//     const prompt = DB_DRIVER === "postgres" ? PG_PROMPT : MSSQL_PROMPT;
//     const sqlResponse = await openai.responses.create({
//       model: "gpt-4.1-mini",
//       input: `${prompt}\n\nUser question:\n${question}`
//     });

//     let sqlQuery = (sqlResponse.output_text || "").trim().replace(/```sql/gi,"").replace(/```/g,"").trim();
//     console.log("Generated SQL:", sqlQuery);

//     const lower = sqlQuery.toLowerCase().trim();
//     const forbidden = ["delete","update","insert","drop","alter","truncate","create","merge","exec","execute"];
//     if (!lower.startsWith("select") && !lower.startsWith("with")) return res.status(400).json({ error: "Only SELECT/WITH queries allowed", sql: sqlQuery });
//     if (forbidden.some(w => lower.includes(w))) return res.status(400).json({ error: "Forbidden keyword", sql: sqlQuery });

//     let recordset;
//     if (DB_DRIVER === "postgres") {
//       const pool = await db.connectionToSqlDB();
//       const result = await pool.query(sqlQuery);
//       recordset = result.rows;
//     } else {
//       const pool = await db.connectionToSqlDB();
//       const result = await pool.request().query(sqlQuery);
//       recordset = result.recordset;
//     }

//     function formatLocalDateTime(d) {
//       const dt = new Date(d);
//       return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0")+" "+String(dt.getHours()).padStart(2,"0")+":"+String(dt.getMinutes()).padStart(2,"0")+":"+String(dt.getSeconds()).padStart(2,"0");
//     }

//     const safeData = recordset.map(row => {
//       const safeRow = { ...row };
//       const tsKey = row.timestamp !== undefined ? "timestamp" : row.ts !== undefined ? "ts" : null;
//       if (tsKey) {
//         if (row[tsKey] instanceof Date) { safeRow.local_timestamp = formatLocalDateTime(row[tsKey]); delete safeRow[tsKey]; }
//         else if (row[tsKey]) { safeRow.local_timestamp = row[tsKey]; delete safeRow[tsKey]; }
//       }
//       return safeRow;
//     });

//     function buildSingleRowAnswer(row) {
//       if (row.total_consumption_today !== undefined) return `    ${row.total_consumption_today}.`;
//       if (row.total_consumption_this_month !== undefined) return `    ${row.total_consumption_this_month}.`;
//       const bid = row.BreakerId ?? row.breakerid;
//       if (row.daily_consumption !== undefined && bid !== undefined) return `    ${bid}  ${row.daily_consumption}.`;
//       if (row.daily_consumption !== undefined) return `   ${row.daily_consumption}.`;
//       if (row.hourly_consumption !== undefined) return `   ${row.hourly_consumption}.`;
//       if (row.max_consumption !== undefined) return `   ${row.max_consumption}.`;
//       if (row.avg_consumption !== undefined) return `   ${row.avg_consumption}.`;
//       const consumption = row.Consumption ?? row.consumption;
//       if (consumption !== undefined && bid !== undefined) return ` ${bid}  ${consumption}.`;
//       return null;
//     }

//     function buildMultiRowAnswer(rows) {
//       if (!Array.isArray(rows) || rows.length === 0) return null;
//       const allDaily = rows.every(r => (r.BreakerId??r.breakerid) !== undefined && r.daily_consumption !== undefined);
//       if (allDaily) {
//         const sorted = [...rows].sort((a,b) => b.daily_consumption - a.daily_consumption);
//         const parts = rows.map(r => ` ${r.BreakerId??r.breakerid}  ${r.daily_consumption}`);
//         return `${parts.join(", ")}.       ${sorted[0].BreakerId??sorted[0].breakerid}  ${sorted[0].daily_consumption}.`;
//       }
//       return null;
//     }

//     let finalAnswer = "  .";
//     if (safeData.length === 0) {
//       finalAnswer = "     .";
//     } else if (safeData.length === 1) {
//       finalAnswer = buildSingleRowAnswer(safeData[0]) || (await openai.responses.create({
//         model: "gpt-4.1-mini",
//         input: `   . : ${question}\n: ${JSON.stringify(safeData)}`
//       })).output_text || "  .";
//     } else {
//       finalAnswer = buildMultiRowAnswer(safeData) || (await openai.responses.create({
//         model: "gpt-4.1-mini",
//         input: `   . : ${question}\n: ${JSON.stringify(safeData)}`
//       })).output_text || "  .";
//     }

//     res.json({ sql: sqlQuery, data: safeData, answer: finalAnswer });

//   } catch (err) {
//     console.error("AI Query error:", err);
//     res.status(500).json({ error: "AI query failed", detail: err.message });
//   }
// });

// =========================
// 11) Auth API
// =========================
app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ detail: "email and password are required" });
    const user = await db.getUserByEmail(email);
    if (!user) return res.status(401).json({ detail: "Invalid email" });
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) return res.status(401).json({ detail: "Invalid credentials" });
    const token = signToken({ id: user.id, username: user.username, email: user.email, role: user.role });
    res.cookie(COOKIE_NAME, token, cookieOptions(req));
    return res.json({ ok: true, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) { return res.status(500).json({ detail: err?.message || "Login failed" }); }
});

app.post("/api/logout", (req, res) => { res.clearCookie(COOKIE_NAME, { path: "/" }); res.json({ ok: true }); });

app.get("/api/me", (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ ok: false, detail: "Not logged in" });
  res.json({ ok: true, user });
});

app.get("/api/tariffs", authRequired, async (req, res) => {
  try { const tariffs = await db.getTariffs(); res.json({ tariffs, vat: vatRate || 0.18 }); }
  catch (err) { res.status(500).json({ detail: "Failed to load tariffs" }); }
});

app.post("/api/change-tariffs", authRequired, async (req, res) => {
  try {
    const { winter, shoulder, summer, vat } = req.body;
    if (!winter||!shoulder||!summer||winter.off==null||winter.peak==null||shoulder.off==null||shoulder.peak==null||summer.off==null||summer.peak==null||vat==null)
      return res.status(400).json({ detail: "Missing required tariff fields" });
    const updatedTariffs = await db.updateAllTariffs({ winter: { off: Number(winter.off), peak: Number(winter.peak) }, shoulder: { off: Number(shoulder.off), peak: Number(shoulder.peak) }, summer: { off: Number(summer.off), peak: Number(summer.peak) } });
    vatRate = Number(vat);
    return res.status(200).json({ ok: true, tariffs: updatedTariffs });
  } catch (err) { return res.status(500).json({ detail: err?.message || "Failed to update tariffs" }); }
});

app.get("/api/location", authRequired, async (req, res) => {
  try { const location = await db.getLocations(); res.json({ location }); }
  catch (err) { res.status(500).json({ detail: "Failed to load location" }); }
});

app.post("/api/update-location", authRequired, async (req, res) => {
  try {
    const { location } = req.body;
    if (!location) return res.status(400).json({ detail: "Location is required" });
    await db.updateLocation(location, 32.502, 34.889);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ detail: "Failed to update location" }); }
});

// =========================
// 12) API Endpoints
// =========================
app.get("/api/health", (req, res) => {
  res.json({ ok: true, tz: TZ, csv_path: CSV_PATH, driver: DB_DRIVER, now: dayjs().tz(TZ).format() });
});

app.get("/api/cities", async (req, res) => {
  try { res.json({ cities: citiesConfig }); }
  catch (err) { res.status(500).json({ detail: "Failed to load cities" }); }
});

app.get("/api/breakers", authRequired, async (req, res) => {
  try { res.json(await db.getBreakerNames()); }
  catch (err) { res.status(500).json({ detail: "Failed to load breakers" }); }
});

app.get("/api/consumption", authRequired, async (req, res) => {
  try {
    const breakerId = String(req.query.breaker_id || "").trim();
    const fromDate  = String(req.query.from_date  || "").trim();
    const toDate    = String(req.query.to_date    || "").trim();
    const view      = String(req.query.view       || "hourly").trim();

    if (!breakerId || !BREAKERS[breakerId]) return res.status(400).json({ detail: "Invalid breaker_id" });
    if (!fromDate || !toDate) return res.status(400).json({ detail: "from_date and to_date are required" });

    const tariffs = await db.getTariffs();
    const { from, to } = rangeToBounds(fromDate, toDate);
    const rawRows = await db.getEnergyData(Number(breakerId), from.toDate(), to.toDate());

    const breakerRows = rawRows
      .map(r => ({ breakerId: String(r.breakerId??r.BreakerId), activeEnergy: Number(r.activeEnergy??r.ActiveEnergy??0), timestamp: dayjs(r.timestamp??r.Timestamp) }))
      .filter(r => r.breakerId === breakerId && r.timestamp.isValid())
      .sort((a,b) => a.timestamp.valueOf() - b.timestamp.valueOf());

    const deltas = computeDeltas(breakerRows, tariffs).filter(d => !d.ts.isBefore(from) && !d.ts.isAfter(to));
    const buckets = new Map();

    for (const dlt of deltas) {
      const key = view==="daily" ? dlt.ts.format("YYYY-MM-DD") : view==="monthly" ? dlt.ts.format("YYYY-MM") : dlt.ts.startOf("hour").format("YYYY-MM-DD HH:00");
      const b = buckets.get(key) || { peak_kwh:0, off_kwh:0, peak_amount:0, off_amount:0 };
      if (dlt.peak) { b.peak_kwh+=dlt.kwh; b.peak_amount+=dlt.amount; } else { b.off_kwh+=dlt.kwh; b.off_amount+=dlt.amount; }
      buckets.set(key, b);
    }

    const allPeriods = [];
    if (view==="daily") { let cur=from.clone(); while(!cur.isAfter(to)){allPeriods.push(cur.format("YYYY-MM-DD"));cur=cur.add(1,"day");} }
    else if (view==="monthly") { let cur=from.clone().startOf("month"); while(!cur.isAfter(to)){allPeriods.push(cur.format("YYYY-MM"));cur=cur.add(1,"month");} }
    else { let cur=from.clone().startOf("hour"); while(!cur.isAfter(to)){allPeriods.push(cur.format("YYYY-MM-DD HH:00"));cur=cur.add(1,"hour");} }

    const outRows = allPeriods.map(period => {
      const b = buckets.get(period);
      const peak_kwh=b?round3(b.peak_kwh):0, off_kwh=b?round3(b.off_kwh):0, kwh=round3(peak_kwh+off_kwh);
      const peak_amount=b?round3(b.peak_amount):0, off_amount=b?round3(b.off_amount):0, amount=round3(peak_amount+off_amount);
      let repTime = view==="daily" ? dayjs.tz(`${period} 12:00`,TZ) : view==="monthly" ? dayjs.tz(`${period}-15 12:00`,TZ) : dayjs.tz(period,"YYYY-MM-DD HH:00",TZ);
      const season = getSeason(repTime);
      if (view==="daily"||view==="monthly") return { timestamp:period, season, peak_kwh, off_kwh, kwh, peak_amount, off_amount, amount };
      const type = peak_kwh>0&&off_kwh===0?"Peak":off_kwh>0&&peak_kwh===0?"Off-Peak":"Mixed";
      const rate = type==="Peak"?tariffs[season].peak:type==="Off-Peak"?tariffs[season].off:"-";
      return { timestamp:period, season, type, kwh, rate, peak_kwh, off_kwh, amount };
    });

    const peak_kwh=round3(deltas.filter(x=>x.peak).reduce((s,x)=>s+x.kwh,0));
    const offpeak_kwh=round3(deltas.filter(x=>!x.peak).reduce((s,x)=>s+x.kwh,0));
    const total_kwh=round3(peak_kwh+offpeak_kwh);
    const peak_amount=round3(deltas.filter(x=>x.peak).reduce((s,x)=>s+x.amount,0));
    const offpeak_amount=round3(deltas.filter(x=>!x.peak).reduce((s,x)=>s+x.amount,0));
    const total_amount=round3(peak_amount+offpeak_amount);

    return res.json({ invoice_no:buildInvoiceNo(), generated_at:dayjs().tz(TZ).format("YYYY-MM-DD HH:mm:ss"), tz:TZ, breaker_ref:breakerId, breaker_name:BREAKERS[breakerId]?.name||`Breaker ${breakerId}`, from:from.format("YYYY-MM-DD"), to:to.format("YYYY-MM-DD"), total_kwh, peak_kwh, offpeak_kwh, peak_amount, offpeak_amount, total_amount, rows:outRows });
  } catch (err) { console.error("Consumption API error:", err); return res.status(500).json({ detail: err?.message || "Server error" }); }
});

app.get("/api/breakers/consumption", authRequired, async (req, res) => {
  try { const data = await db.getBreakersLastDailyAndHourlyConsumption(); res.json({ success:true, summary:data.summary, hourly:data.hourly }); }
  catch (err) { res.status(500).json({ success:false, message:"Failed to fetch breakers consumption data" }); }
});

app.get("/api/debug-rows", authRequired, (req, res) => {
  try {
    const breakerId = String(req.query.breaker_id || "").trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
    if (!breakerId || !BREAKERS[breakerId]) return res.status(400).json({ detail: "Invalid breaker_id" });
    const rows = parseCsvRows(safeReadCsvText()).filter(r=>String(r.breakerId)===breakerId).sort((a,b)=>b.timestamp.valueOf()-a.timestamp.valueOf()).slice(0,limit).map(r=>({ breakerId:r.breakerId, activeEnergy:r.activeEnergy, timestamp:r.timestamp.tz(TZ).format("YYYY-MM-DD HH:mm:ss") }));
    res.json({ breaker_id:breakerId, count:rows.length, rows });
  } catch (err) { res.status(500).json({ detail:err?.message||"Server error", csv_path:CSV_PATH }); }
});

app.post("/api/register", async (req, res) => {
  try {
    const username = String(req.body?.username||"").trim();
    const email    = String(req.body?.email||"").trim().toLowerCase();
    const password = String(req.body?.password||"");
    const role     = String(req.body?.role||"").trim().toLowerCase();
    if (!username||!email||!password||!role) return res.status(400).json({ detail:"All fields are required" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ detail:"Invalid email format" });
    if (!["admin","user"].includes(role)) return res.status(400).json({ detail:"Invalid role" });
    if (await db.getUserByEmail(email)) return res.status(409).json({ detail:"Email already exists" });
    if (await db.getUserByUsername(username)) return res.status(409).json({ detail:"Username already exists" });
    const passwordHash = await bcrypt.hash(password, 10);
    await db.createUser(username, email, passwordHash, role);
    return res.status(201).json({ ok:true, user:{ username, email, role } });
  } catch (err) { return res.status(500).json({ detail:err?.message||"Registration failed" }); }
});

// =========================
// 13) Report Schedules
// =========================
registerReportScheduleRoutes(app, db, authRequired, DB_DRIVER);

// =========================
// 13a) Report Scheduler — runs every minute
// =========================
async function runScheduler() {
  try {
    const now = new Date();
    const nowH = now.getHours();
    const nowM = now.getMinutes();
    const nowDay = now.getDay();       // 0=Sun
    const nowDate = now.getDate();

    let rows;
    if (DB_DRIVER === "postgres") {
      const pool = await db.connectionToSqlDB();
      const result = await pool.query("SELECT * FROM report_schedule WHERE active = true");
      rows = result.rows;
    } else {
      const pool = await db.connectionToSqlDB();
      const result = await pool.request().query("SELECT * FROM report_schedule WHERE active = 1");
      rows = result.recordset;
    }

    for (const rawRow of rows) {
      try {
        // Parse send_time
        let schedH = 23, schedM = 30;
        if (rawRow.send_time) {
          if (rawRow.send_time instanceof Date) {
            schedH = rawRow.send_time.getHours();
            schedM = rawRow.send_time.getMinutes();
          } else {
            const parts = String(rawRow.send_time).slice(0,5).split(":");
            schedH = Number(parts[0]); schedM = Number(parts[1]);
          }
        }

        // Check if now matches scheduled time (within same minute)
        if (nowH !== schedH || nowM !== schedM) continue;

        // Check frequency
        const freq = rawRow.frequency;
        if (freq === "weekly") {
          const dayWeek = Number(rawRow.send_day_week ?? 0);
          if (nowDay !== dayWeek) continue;
        }
        if (freq === "monthly") {
          const dayMonth = Number(rawRow.send_day_month ?? 1);
          if (nowDate !== dayMonth) continue;
        }

        // Check if already sent today (prevent double-send)
        const lastSent = rawRow.last_sent ? new Date(rawRow.last_sent) : null;
        if (lastSent) {
          const diffMs = now - lastSent;
          if (diffMs < 60 * 1000) continue; // sent less than 1 min ago
        }

        console.log("[SCHEDULER] Sending report:", rawRow.name, "at", nowH + ":" + String(nowM).padStart(2,"0"));

        const { sendScheduledReport } = await import("../energyComsamption/emailReport.js");
        const breaker_ids = DB_DRIVER === "postgres"
          ? (Array.isArray(rawRow.breaker_ids) ? rawRow.breaker_ids : [])
          : JSON.parse(rawRow.breaker_ids || "[]").map(Number);
        const recipients = DB_DRIVER === "postgres"
          ? (Array.isArray(rawRow.recipients) ? rawRow.recipients : [])
          : JSON.parse(rawRow.recipients || "[]");

        const row = {
          id: rawRow.id, name: rawRow.name, breaker_ids, frequency: freq,
          send_time: schedH + ":" + String(schedM).padStart(2,"0"),
          recipients,
        };

        await sendScheduledReport(row);

        // Update last_sent
        if (DB_DRIVER === "postgres") {
          const pool = await db.connectionToSqlDB();
          await pool.query("UPDATE report_schedule SET last_sent=NOW() WHERE id=$1", [rawRow.id]);
        } else {
          const pool = await db.connectionToSqlDB();
          await pool.request().query("UPDATE report_schedule SET last_sent=GETDATE() WHERE id=" + rawRow.id);
        }

        console.log("[SCHEDULER] Report sent:", rawRow.name);
      } catch (err) {
        console.error("[SCHEDULER] Error for schedule", rawRow.id, ":", err.message);
      }
    }
  } catch (err) {
    console.error("[SCHEDULER] Fatal error:", err.message);
  }
}

// Run every minute
setInterval(runScheduler, 60 * 1000);
console.log("[SCHEDULER] Report scheduler started");

// =========================
// 13b) WhatsApp Bot
// =========================
import twilio from "twilio";

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendWhatsApp(to, body) {
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
      to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      body,
    });
  } catch (err) {
    console.error("WhatsApp send error:", err.message);
  }
}

// async function handleWhatsAppMessage(from, body) {
//   const msg = body.trim().toLowerCase();

//   // Help
//   if (msg === "help" || msg === "?") {
//     return "*ABB Energy Monitoring Bot*\n\nCommands:\nconsumption - today kWh\ncost - today ILS\npeak - peak hours\nforecast - end-of-day\ncharging - PB1 stations\nhelp - this menu\n\nOr ask freely: How much did B0 consume today?";
//   }

//   // Fetch today's data
//   const today = new Date().toISOString().slice(0, 10);
  
//   const BREAKERS = [
//     { id: "1",  name: "B0 — Main" },
//     { id: "22", name: "Roof — Main" },
//     { id: "27", name: "PB — Main" },
//     { id: "30", name: "PV Panels" },
//   ];

//   const fetchBreaker = async (id) => {
//     try {
//       const pool = await db.connectionToSqlDB();
//       // Use existing consumption logic
//       const tariffs = await db.getTariffs();
//       const rows = await db.getEnergyData(Number(id), new Date(today + "T00:00:00"), new Date(today + "T23:59:59"));
//       if (!rows || rows.length < 2) return { kwh: 0, ils: 0, peak_kwh: 0 };
//       const sorted = rows.map(r => ({ ae: Number(r.activeEnergy||r.ActiveEnergy||0), ts: new Date(r.timestamp||r.Timestamp) })).sort((a,b)=>a.ts-b.ts);
//       let kwh=0, peak_kwh=0, ils=0;
//       for (let i=1; i<sorted.length; i++) {
//         const delta = sorted[i].ae - sorted[i-1].ae;
//         if (delta<=0) continue;
//         const h=sorted[i].ts.getHours(), d=sorted[i].ts.getDay(), m=sorted[i].ts.getMonth()+1;
//         const season=(m===12||m<=2)?"winter":(m>=6&&m<=9)?"summer":"shoulder";
//         const isPeak=d>=0&&d<=4&&h>=17&&h<22;
//         const rate=isPeak?tariffs[season].peak:tariffs[season].off;
//         kwh+=delta; ils+=delta*rate;
//         if(isPeak) peak_kwh+=delta;
//       }
//       return { kwh: Math.round(kwh), ils: Math.round(ils), peak_kwh: Math.round(peak_kwh) };
//     } catch { return { kwh:0, ils:0, peak_kwh:0 }; }
//   };

//   if (msg.includes("consumption") || msg.includes("kwh")) {
//     const results = await Promise.all(BREAKERS.map(b => fetchBreaker(b.id).then(d => ({...b,...d}))));
//     const total = results.reduce((s,r)=>s+r.kwh,0);
//     const lines = results.map(r => "- " + r.name + ": " + r.kwh.toLocaleString() + " kWh").join("\n");
//     return "Consumption today (" + today + "):\n\n" + lines + "\n\nTotal: " + total.toLocaleString() + " kWh";
//   }

//   if (msg.includes("cost") || msg.includes("ils")) {
//     const results = await Promise.all(BREAKERS.map(b => fetchBreaker(b.id).then(d => ({...b,...d}))));
//     const total = results.reduce((s,r)=>s+r.ils,0);
//     const lines = results.map(r => "- " + r.name + ": ILS " + r.ils.toLocaleString()).join("\n");
//     return "Cost today (" + today + "):\n\n" + lines + "\n\nTotal: ILS " + total.toLocaleString() + "\nIncl VAT: ILS " + Math.round(total*1.18).toLocaleString();
//   }

//   if (msg.includes("peak")) {
//     const results = await Promise.all(BREAKERS.map(b => fetchBreaker(b.id).then(d => ({...b,...d}))));
//     const total = results.reduce((s,r)=>s+r.kwh,0);
//     const totalPeak = results.reduce((s,r)=>s+r.peak_kwh,0);
//     const pct = total > 0 ? Math.round(totalPeak/total*100) : 0;
//     const lines = results.map(r => "- " + r.name + ": " + r.peak_kwh + " kWh").join("\n");
//     return "Peak hours today:\n\n" + lines + "\n\nTotal peak: " + totalPeak.toLocaleString() + " kWh (" + pct + "%)";
//   }

//   if (msg.includes("forecast")) {
//     const results = await Promise.all(BREAKERS.map(b => fetchBreaker(b.id).then(d => ({...b,...d}))));
//     const totalKwh = results.reduce((s,r)=>s+r.kwh,0);
//     const now = new Date();
//     const hoursPassed = now.getHours() + now.getMinutes()/60;
//     const rate = hoursPassed > 0 ? totalKwh / hoursPassed : 0;
//     const forecast = Math.round(totalKwh + rate * (24 - hoursPassed));
//     return "End-of-day forecast:\n\nSo far: " + totalKwh.toLocaleString() + " kWh\nRate: " + Math.round(rate) + " kWh/h\n\nForecast: " + forecast.toLocaleString() + " kWh";
//   }

//   if (msg.includes("charging") || msg.includes("pb1")) {
//     const pb1 = await fetchBreaker("28");
//     const ac = await fetchBreaker("29");
//     return "Charging PB1 today:\n\nPB1 Main: " + pb1.kwh.toLocaleString() + " kWh | ILS " + pb1.ils + "\nAC Charges: " + ac.kwh.toLocaleString() + " kWh | ILS " + ac.ils + "\n\nTotal: " + (pb1.kwh+ac.kwh).toLocaleString() + " kWh";
//   }

//   // Free question via OpenAI
//   try {
//     const results = await Promise.all(BREAKERS.map(b => fetchBreaker(b.id).then(d => ({...b,...d}))));
//     const context = results.map(r=>`${r.name}: ${r.kwh} kWh, ₪${r.ils}`).join(", ");
//     const resp = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [
//         { role: "system", content: "You are ABB Energy Bot. Today consumption data: " + context + ". Answer briefly." },
//         { role: "user", content: body }
//       ],
//       max_tokens: 200,
//     });
//     return resp.choices[0].message.content;
//   } catch {
//     return "Not understood. Send help for commands list.";
//   }
// }

// Webhook endpoint
app.post("/api/whatsapp/webhook", express.urlencoded({ extended: false }), async (req, res) => {
  const from = req.body?.From || "";
  const body = req.body?.Body || "";
  console.log(`📱 WhatsApp from ${from}: ${body}`);
  
  try {
    const reply = await handleWhatsAppMessage(from, body);
    const MessagingResponse = twilio.twiml.MessagingResponse;
    const twiml = new MessagingResponse();
    twiml.message(reply);
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("WhatsApp webhook error:", err.message);
    res.status(500).send("");
  }
});

// =========================
// 13c) Test Report Endpoint
// =========================
app.post("/api/test-report", authRequired, async (req, res) => {
  try {
    console.log("[TEST] Starting test report...");
    console.log("[TEST] PUPPETEER_EXECUTABLE_PATH:", process.env.PUPPETEER_EXECUTABLE_PATH);
    console.log("[TEST] EMAIL_USER:", process.env.EMAIL_USER);
    const { sendScheduledReport } = await import("../energyComsamption/emailReport.js");
    const testSchedule = {
      id: 0,
      name: "Test Report",
      breaker_ids: [1, 22, 27],
      frequency: "daily",
      recipients: [process.env.EMAIL_RECIPIENTS || "haimhuber90@gmail.com"],
    };
    const result = await sendScheduledReport(testSchedule, true);
    res.json({ ok: true, message: "Test report sent!", filename: result?.filename, path: result?.path });
  } catch (err) {
    console.error("[TEST] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =========================
// 14) Update API
// =========================
let updateStatus = { checking: false, applying: false, lastCheck: null, hasUpdate: false, localCommit: null, remoteCommit: null, error: null };

// Track update status
let justUpdated = false;
app.get("/api/updates/status", authRequired, (req, res) => {
  const was = justUpdated;
  justUpdated = false; // reset after first read
  res.json({ justUpdated: was });
});

app.post("/api/updates/done", (req, res) => {
  justUpdated = true;
  console.log("✅ Update completed successfully!");
  res.json({ ok: true });
});

app.get("/api/updates/check", authRequired, async (req, res) => {
  try {
    updateStatus.checking = true;
    const { execSync } = await import("child_process");
    const { default: https } = await import("https");

    // Get local commit
    const localCommit = execSync("git rev-parse HEAD", { cwd: "C:\\EnergyMeasuring" }).toString().trim();

    // Get remote commit via GitHub API
    const remoteCommit = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        path: `/repos/${process.env.GITHUB_REPO}/commits/main`,
        headers: {
          "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "EnergyMeasuring-App",
          "Accept": "application/vnd.github.v3+json",
        },
        family: 4,
      };
      https.get(options, (r) => {
        let data = "";
        r.on("data", c => data += c);
        r.on("end", () => {
          try { resolve(JSON.parse(data).sha); } catch { reject(new Error("Failed to parse GitHub response")); }
        });
      }).on("error", reject);
    });

    const hasUpdate = localCommit !== remoteCommit;
    updateStatus = { checking: false, applying: false, lastCheck: new Date().toISOString(), hasUpdate, localCommit: localCommit.slice(0,7), remoteCommit: remoteCommit?.slice(0,7), error: null };
    res.json(updateStatus);
  } catch (err) {
    updateStatus = { ...updateStatus, checking: false, error: err.message };
    res.status(500).json({ ...updateStatus, error: err.message });
  }
});

app.post("/api/updates/apply", authRequired, async (req, res) => {
  if (updateStatus.applying) return res.status(409).json({ detail: "Update already in progress" });
  updateStatus.applying = true;
  res.json({ ok: true, message: "Update started — server will restart in ~30 seconds" });
  // Run update script after response is sent
  setTimeout(async () => {
    try {
      const { exec } = await import("child_process");
      exec("C:\\EnergyMeasuring\\EnergyDashboard\\update.bat", { cwd: "C:\\EnergyMeasuring" }, (err) => {
        if (err) console.error("Update error:", err.message);
      });
    } catch (err) { console.error("Update failed:", err.message); }
  }, 500);
});

// =========================
// 15) Catch-all for React Router
// =========================
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ detail: "Not found" });
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// =========================
// 16) Start
// =========================
app.listen(PORT, "0.0.0.0", () => { console.log(`✅ Energy API running — driver: ${DB_DRIVER}`); });