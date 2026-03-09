// server.js
// Energy API + UI server
// כולל: טעינת CSV, חישובי תעריפים, UI סטטי (login/index) + ניהול Login עם Cookie (JWT HttpOnly)

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
// JSON import (Node ESM)
import breakersConfig from "../energyComsamption/breakerConfig.json" with { type: "json" };
import db from "../energyComsamption/db.js";

// 1) בסיס והגדרות כלליות
// =========================
dayjs.extend(utc);
dayjs.extend(timezone);
const test = 0;
const TZ = "Asia/Jerusalem";
const PORT = Number(process.env.PORT || 8000);

// נתיבי CSV
const CSV_DIR =
  process.env.CSV_DIR || "C:\\Energy";
const CSV_FILE = process.env.CSV_FILE || "energyData.csv";
const CSV_PATH = path.join(CSV_DIR, CSV_FILE);

// תיקיית UI סטטית (public)
const PUBLIC_DIR = path.join(process.cwd(), "public");

// =========================
// 2) Breakers config
// =========================
// הופך רשימה כמו: "1 - Q0 Roof" למפה: { "1": {id:"1", name:"Q0 Roof"} }
const BREAKERS = Object.fromEntries(
  (breakersConfig?.breakers || []).map((item) => {
    const [id, name] = String(item).split(" - ");
    const sid = String(id || "").trim();
    const sname = String(name || "").trim();
    return [sid, { id: sid, name: sname || `Breaker ${sid}` }];
  })
);

// =========================
// 3) תעריפים (לפני מע"מ) + מע"מ
// =========================
const TARIFFS = await db.getTariffs();
const VAT_RATE = Number(process.env.VAT_RATE ?? 0.18);

// =========================
// 4) AUTH: JWT + Cookie
// =========================
const COOKIE_NAME = "token";
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = "30m";


function cookieOptions(req) {
  // אם אתה מאחורי reverse proxy (Nginx / IIS / Load balancer) הפעל:
  // app.set("trust proxy", 1);
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    secure: isHttps, // בפרודקשן עם HTTPS יהיה true, בלוקאל לרוב false
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 60 * 1000, // 30 minutes
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function getUserFromReq(req) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authRequired(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ detail: "Unauthorized" });
  req.user = user;
  next();
}

// =========================
// 5) Network helpers (IP)
// =========================
function getAllLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net && net.family === "IPv4" && !net.internal) {
        ips.push({ name, ip: net.address });
      }
    }
  }
  return ips;


}

function pickPreferredIp() {
  if (process.env.HOST_IP && process.env.HOST_IP.trim()) return process.env.HOST_IP.trim();
  const all = getAllLanIps();
  const prefer192 = all.find((x) => x.ip.startsWith("192.168.1."));
  return (prefer192 || all[0])?.ip || "127.0.0.1";
}

// =========================
// 6) CSV helpers
// =========================
function safeReadCsvText() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }
  let txt = fs.readFileSync(CSV_PATH, "utf8");

  // Remove UTF-8 BOM if exists
  if (txt && txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);

  return txt;
}

/**
 * Normalize row:
 * - תומך בשמות שדות שונים
 * - ממיר מספרים
 * - ממיר timestamp ל-dayjs TZ
 */
function normalizeRowFields(r) {
  const breakerId = r?.BreakerId ?? r?.breakerId ?? r?.breaker_id ?? r?.breaker ?? r?.id;
  const activeEnergy = r?.ActiveEnergy ?? r?.activeEnergy ?? r?.active_energy ?? r?.energy;
  const tsRaw = r?.timestamp ?? r?.time ?? r?.date;

  if (breakerId == null || activeEnergy == null || !tsRaw) return null;

  /**
   * NOTE:
   * אם ה-CSV נכתב ISO עם 'Z' (UTC), ומטרתך להציג בישראל בלי "הזזה",
   * אנחנו מסירים Z כדי לשמר "שעת קיר".
   * אם תרצה התנהגות אחרת (UTC->Israel) – תגיד לי ונחליף לוגיקה.
   */
  let tsStr = String(tsRaw).trim();
  if (tsStr.endsWith("Z")) tsStr = tsStr.replace(/Z$/, "");

  const t = dayjs.tz(tsStr, TZ);
  if (!t.isValid()) return null;

  const bid = Number(breakerId);
  const ae = Number(String(activeEnergy).trim().replace(/,/g, "")); // תומך 1,234

  if (!Number.isFinite(bid) || bid <= 0) return null;
  if (!Number.isFinite(ae)) return null;

  return { breakerId: bid, activeEnergy: ae, timestamp: t };
}

/**
 * FALLBACK קשיח:
 * במקרה ש-PapaParse זורק "Too many fields" (שורות שבורות),
 * אנחנו נאפשר רק שורות עם בדיוק 3 עמודות: BreakerId,ActiveEnergy,timestamp
 */
function parseCsvRowsFallback3cols(csvText) {
  const lines = String(csvText || "").split(/\r?\n/);
  const out = [];
  const bad = [];

  if (!lines.length) return { rows: [], bad };

  const header = (lines[0] || "").trim().toLowerCase();
  if (!header.startsWith("breakerid")) {
    throw new Error(`CSV header invalid. First line: "${lines[0] || ""}"`);
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;

    const commas = (raw.match(/,/g) || []).length;
    if (commas !== 2) {
      bad.push({ lineNo: i + 1, reason: `commas=${commas}`, raw });
      continue;
    }

    const [bidStr, aeStr, tsStr] = raw.split(",");

    const norm = normalizeRowFields({
      BreakerId: bidStr?.trim(),
      ActiveEnergy: aeStr?.trim(),
      timestamp: tsStr?.trim(),
    });

    if (!norm) {
      bad.push({ lineNo: i + 1, reason: "invalid fields", raw });
      continue;
    }

    out.push(norm);
  }

  return { rows: out, bad };
}

function parseCsvRows(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const errors = parsed.errors || [];
  const hasTooManyFields = errors.some((e) =>
    String(e?.message || "").toLowerCase().includes("too many fields")
  );

  if (hasTooManyFields) {
    const { rows, bad } = parseCsvRowsFallback3cols(csvText);
    if (bad.length) {
      console.warn(
        `[CSV WARN] TooManyFields -> used fallback3cols. Skipped ${bad.length} bad line(s). First bad:`,
        bad[0]
      );
    }
    return rows;
  }

  if (errors.length) {
    const msg = errors.slice(0, 5).map((e) => e.message).join(" | ");
    throw new Error(`CSV parse errors: ${msg}`);
  }

  const data = parsed.data || [];
  const out = [];
  let skipped = 0;

  for (const r of data) {
    const norm = normalizeRowFields(r);
    if (!norm) {
      skipped++;
      continue;
    }
    out.push(norm);
  }

  if (skipped) {
    console.warn(`[CSV WARN] skipped ${skipped} row(s) after normalization (missing/invalid fields).`);
  }

  return out;
}

// =========================
// 7) Tariff helpers
// =========================
function getSeason(t) {
  const m = t.month() + 1;
  if (m === 12 || m === 1 || m === 2) return "winter";
  if (m >= 6 && m <= 9) return "summer";
  return "shoulder";
}

function isPeak(t) {
  const hour = t.hour();
  const season = getSeason(t);

  // Summer: peak only Sun–Thu 17:00–23:00
  if (season === "summer") {
    const d = t.day(); // Sun=0..Sat=6
    const isSunThu = d >= 0 && d <= 4;
    if (!isSunThu) return false;
    return hour >= 17 && hour < 23;
  }

  // Winter: peak every day 17:00–22:00
  if (season === "winter") return hour >= 17 && hour < 22;

  // Shoulder: Sun–Thu only 17:00–22:00
  const d = t.day();
  const isSunThu = d >= 0 && d <= 4;
  if (!isSunThu) return false;
  return hour >= 17 && hour < 22;
}

function getRateNisPerKwh(t, peak) {
  const season = getSeason(t);
  return peak ? TARIFFS[season].peak : TARIFFS[season].off;
}

function rangeToBounds(fromDate, toDate) {
  const from = dayjs.tz(fromDate, TZ).startOf("day");
  const to = dayjs.tz(toDate, TZ).endOf("day");
  if (!from.isValid() || !to.isValid()) throw new Error("Invalid date range");
  if (from.isAfter(to)) throw new Error('"from_date" must be <= "to_date"');
  return { from, to };
}

/**
 * computeDeltas:
 * לוקח רשומות ממויינות לפי זמן
 * מחשב דלתא צריכה (activeEnergy - prev.activeEnergy)
 * מדלג על:
 * - דלתא שלילית (ריסט מונה / טעות)
 * - דלתא 0
 */
function computeDeltas(sortedRows) {
  const out = [];
  let prev = null;

  for (const row of sortedRows) {
    if (!prev) {
      prev = row;
      continue;
    }

    const delta = row.activeEnergy - prev.activeEnergy;

    if (!Number.isFinite(delta) || delta < 0) {
      prev = row;
      continue;
    }
    if (delta === 0) {
      prev = row;
      continue;
    }

    const peak = isPeak(row.timestamp);
    const rate = getRateNisPerKwh(row.timestamp, peak);

    out.push({
      ts: row.timestamp,
      kwh: delta,
      peak,
      season: getSeason(row.timestamp),
      rate,
      amount: delta * rate,
    });

    prev = row;
  }

  return out;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function buildInvoiceNo() {
  return `INV-${dayjs().tz(TZ).format("YYYYMMDD-HHmmss")}`;
}

// =========================
// 8) App init + Middlewares
// =========================
const app = express();

// אם אתה משתמש ב-cookie עם בקשות קרוס-דומיין, תצטרך origin ספציפי + credentials
// כרגע זה מאפשר הכל (נוח לפיתוח). אם אתה על אותו שרת (UI+API) זה בסדר.
app.use(cors({ origin: true, credentials: true }));

app.use(express.json());
app.use(cookieParser());

// Serve static files (CSS/JS/images) אבל בלי index אוטומטי,
// כדי שאנחנו נחליט ב-GET / אם להחזיר login או index.
app.use(express.static(PUBLIC_DIR, { index: false }));

// =========================
// 9) UI Routes: Login / Index
// =========================
app.get("/", (req, res) => {
  const user = getUserFromReq(req);

  if (!user) {
    return res.sendFile(path.join(PUBLIC_DIR, "login.html"));
  }

  return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// =========================
// 10) AUTH API
// =========================
app.post("/api/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({ detail: "username and password are required" });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ detail: "Invalid username" });
    }
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ detail: "Invalid credentials" });
    }
    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.cookie(COOKIE_NAME, token, cookieOptions(req));

    return res.json({
      ok: true,
      user: {
        username: user.username,
        role: user.role
      }
    });

  } catch (err) {
    return res.status(500).json({ detail: err?.message || "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ ok: false, detail: "Not logged in" });
  res.json({ ok: true, user });
});

// =========================
// 11) API Endpoints
// =========================

// Health endpoint – פתוח גם בלי login
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    tz: TZ,
    csv_path: CSV_PATH,
    now: dayjs().tz(TZ).format(),
  });
});

// Breakers – מוגן (רק למשתמש מחובר)
app.get("/api/breakers", authRequired, async (req, res) => {
  try {
    const breakerList = await db.getBreakerNames();
    console.log(breakerList);
    res.json(breakerList);
  } catch (err) {
    console.error("Error loading breakers:", err);
    res.status(500).json({ detail: "Failed to load breakers" });
  }
});

// תאריכים זמינים ל-breaker – מוגן
app.get("/api/available-dates", authRequired, (req, res) => {
  try {
    const breakerId = String(req.query.breaker_id || "").trim();
    if (!breakerId || !BREAKERS[breakerId]) {
      return res.status(400).json({ detail: "Invalid breaker_id" });
    }

    const rows = parseCsvRows(safeReadCsvText())
      .filter((r) => String(r.breakerId) === breakerId)
      .sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf());

    if (!rows.length) {
      return res.json({ breaker_id: breakerId, dates: [], min: null, max: null });
    }

    const set = new Set();
    for (const r of rows) set.add(r.timestamp.format("YYYY-MM-DD"));

    const dates = Array.from(set).sort();
    res.json({
      breaker_id: breakerId,
      dates,
      min: dates[0],
      max: dates[dates.length - 1],
    });
  } catch (err) {
    res.status(500).json({ detail: err?.message || "Server error", csv_path: CSV_PATH });
  }
});

// Consumption – מוגן
app.get("/api/consumption", authRequired, (req, res) => {
  try {
    const breakerId = String(req.query.breaker_id || "").trim();
    const fromDate = String(req.query.from_date || "").trim();
    const toDate = String(req.query.to_date || "").trim();
    const view = String(req.query.view || "hourly").trim(); // hourly | daily | monthly

    if (!breakerId || !BREAKERS[breakerId]) {
      return res.status(400).json({ detail: "Invalid breaker_id" });
    }
    if (!fromDate || !toDate) {
      return res.status(400).json({ detail: "from_date and to_date are required (YYYY-MM-DD)" });
    }
    if (view !== "hourly" && view !== "daily" && view !== "monthly") {
      return res.status(400).json({ detail: 'view must be "hourly", "daily" or "monthly"' });
    }

    const { from, to } = rangeToBounds(fromDate, toDate);

    // קוראים CSV ומסננים breaker
    const rows = parseCsvRows(safeReadCsvText());
    const breakerRows = rows
      .filter((r) => String(r.breakerId) === breakerId)
      .sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf());

    // מחשבים דלתא ומסננים לפי טווח
    const deltas = computeDeltas(breakerRows).filter(
      (d) => !d.ts.isBefore(from) && !d.ts.isAfter(to)
    );

    // קיבוץ לפי שעה/יום/חודש
    const buckets = new Map();
    for (const dlt of deltas) {
      const key =
        view === "daily"
          ? dlt.ts.format("YYYY-MM-DD")
          : view === "monthly"
            ? dlt.ts.format("YYYY-MM")
            : dlt.ts.startOf("hour").format("YYYY-MM-DD HH:00");

      const b = buckets.get(key) || { peak_kwh: 0, off_kwh: 0, peak_amount: 0, off_amount: 0 };

      if (dlt.peak) {
        b.peak_kwh += dlt.kwh;
        b.peak_amount += dlt.amount;
      } else {
        b.off_kwh += dlt.kwh;
        b.off_amount += dlt.amount;
      }

      buckets.set(key, b);
    }

    const keys = Array.from(buckets.keys()).sort();

    // Build a complete list of all periods in the requested range
    let allPeriods = [];
    if (view === "daily") {
      let cur = from.clone();
      while (!cur.isAfter(to)) {
        allPeriods.push(cur.format("YYYY-MM-DD"));
        cur = cur.add(1, "day");
      }
    } else if (view === "monthly") {
      let cur = from.clone().startOf("month");
      while (!cur.isAfter(to)) {
        allPeriods.push(cur.format("YYYY-MM"));
        cur = cur.add(1, "month");
      }
    } else {
      // hourly
      let cur = from.clone().startOf("hour");
      while (!cur.isAfter(to)) {
        allPeriods.push(cur.format("YYYY-MM-DD HH:00"));
        cur = cur.add(1, "hour");
      }
    }

    let outRows = allPeriods.map((period) => {
      const b = buckets.get(period);
      const peak_kwh = b ? round3(b.peak_kwh) : 0;
      const off_kwh = b ? round3(b.off_kwh) : 0;
      const kwh = b ? round3(peak_kwh + off_kwh) : 0;
      const peak_amount = b ? round3(b.peak_amount) : 0;
      const off_amount = b ? round3(b.off_amount) : 0;
      const amount = b ? round3(peak_amount + off_amount) : 0;

      let repTime;
      if (view === "daily") {
        repTime = dayjs.tz(period + " 12:00", TZ);
      } else if (view === "monthly") {
        repTime = dayjs.tz(period + "-15 12:00", TZ);
      } else {
        repTime = dayjs.tz(period, "YYYY-MM-DD HH:00", TZ);
      }
      const season = getSeason(repTime);

      if (view === "daily" || view === "monthly") {
        return { timestamp: period, season, peak_kwh, off_kwh, kwh, peak_amount, off_amount, amount };
      }
      // hourly
      const type =
        peak_kwh > 0 && off_kwh === 0 ? "Peak" :
          off_kwh > 0 && peak_kwh === 0 ? "Off-Peak" :
            "Mixed";
      const rate =
        type === "Peak" ? TARIFFS[season].peak :
          type === "Off-Peak" ? TARIFFS[season].off :
            "-";
      return { timestamp: period, season, type, kwh, rate, peak_kwh, off_kwh, amount };
    });

    // totals
    const peak_kwh = round3(deltas.filter((x) => x.peak).reduce((s, x) => s + x.kwh, 0));
    const offpeak_kwh = round3(deltas.filter((x) => !x.peak).reduce((s, x) => s + x.kwh, 0));
    const total_kwh = round3(peak_kwh + offpeak_kwh);

    const peak_amount = round3(deltas.filter((x) => x.peak).reduce((s, x) => s + x.amount, 0));
    const offpeak_amount = round3(deltas.filter((x) => !x.peak).reduce((s, x) => s + x.amount, 0));
    const total_amount = round3(peak_amount + offpeak_amount);

    const tariffs_with_vat = Object.fromEntries(
      Object.entries(TARIFFS).map(([season, vals]) => [
        season,
        {
          off: Number((vals.off * (1 + VAT_RATE)).toFixed(4)),
          peak: Number((vals.peak * (1 + VAT_RATE)).toFixed(4)),
        },
      ])
    );

    res.json({
      invoice_no: buildInvoiceNo(),
      generated_at: dayjs().tz(TZ).format("YYYY-MM-DD HH:mm:ss"),
      tz: TZ,

      // breaker info
      breaker_ref: breakerId,
      breaker_name: BREAKERS[breakerId]?.name || `Breaker ${breakerId}`,

      from: from.format("YYYY-MM-DD"),
      to: to.format("YYYY-MM-DD"),

      tariffs_before_vat: TARIFFS,
      tariffs_with_vat,

      peak_definition: {
        note: "Definition in code (season dependent).",
        winter: "Daily 17:00–22:00",
        shoulder: "Sun–Thu 17:00–22:00",
        summer: "Sun–Thu 17:00–23:00",
      },

      total_kwh,
      peak_kwh,
      offpeak_kwh,

      peak_amount,
      offpeak_amount,
      total_amount,

      rows: outRows,
    });
  } catch (err) {
    res.status(500).json({ detail: err?.message || "Server error", csv_path: CSV_PATH });
  }
});

// Debug rows – מוגן
app.get("/api/debug-rows", authRequired, (req, res) => {
  try {
    const breakerId = String(req.query.breaker_id || "").trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));

    if (!breakerId || !BREAKERS[breakerId]) {
      return res.status(400).json({ detail: "Invalid breaker_id" });
    }

    const rows = parseCsvRows(safeReadCsvText())
      .filter((r) => String(r.breakerId) === breakerId)
      .sort((a, b) => b.timestamp.valueOf() - a.timestamp.valueOf())
      .slice(0, limit)
      .map((r) => ({
        breakerId: r.breakerId,
        activeEnergy: r.activeEnergy,
        timestamp: r.timestamp.tz(TZ).format("YYYY-MM-DD HH:mm:ss"),
      }));

    res.json({ breaker_id: breakerId, count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ detail: err?.message || "Server error", csv_path: CSV_PATH });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ detail: "All fields are required" });
    }
    // Check if user exists
    const existing = await db.getUserByUsername(username);
    if (existing && existing.username === username) {
      return res.status(409).json({ detail: "Username already exists" });
    }
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    // Insert user
    await db.createUser(username, passwordHash, role);
    return res.json({ ok: true, username });
  } catch (err) {
    res.status(500).json({ detail: err?.message || "Registration failed" });
  }
});

// =========================
// 12) Start server
// =========================
const preferred = pickPreferredIp();
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Energy API + UI running");
});