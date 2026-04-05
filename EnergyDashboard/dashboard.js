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
import OpenAI from "openai";
import citiesConfig from "../EnergyDashboard/public/cities.json" with { type: "json" };

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
const breakerRows = await db.getBreakerNamesInitial();

const BREAKERS = Object.fromEntries(
  breakerRows.map((row) => {
    const sid = String(row.id).trim();
    const sname = String(row.name || "").trim();
    const sdisplayName = String(row.displayName || "").trim();

    return [
      sid,
      {
        id: sid,
        name: sname || `Breaker ${sid}`,
        displayName: sdisplayName || `${sid} - ${sname || `Breaker ${sid}`}`
      }
    ];
  })
);
// =========================
// 3) תעריפים (לפני מע"מ) + מע"מ
// =========================
const TARIFFS = await db.getTariffs();
let vatRate = 0.18;

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
  // Accept tariffs as a third argument (object)
  // If not provided, fallback to global TARIFFS (for legacy calls)
  const tariffs = arguments.length > 2 ? arguments[2] : TARIFFS;
  return peak ? tariffs[season].peak : tariffs[season].off;
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
function computeDeltas(sortedRows, tariffs) {
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
    const rate = getRateNisPerKwh(row.timestamp, peak, tariffs);

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
app.post("/api/ai-query", authRequired, async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Missing question" });
  }

  try {
    const sqlResponse = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
You generate SQL Server queries for energy analysis.

Important rules:
1. EnergyData.ActiveEnergy is a cumulative meter value.
2. Never SUM ActiveEnergy directly.
3. Consumption must be calculated from differences between consecutive readings.
4. Hourly consumption = current ActiveEnergy - previous ActiveEnergy.
5. Use SQL Server syntax only.
6. Return ONLY raw SQL.
7. Do not use markdown.
8. Do not use triple backticks.
9. Only SELECT or WITH...SELECT queries are allowed.
10. The [timestamp] column in EnergyData is already stored in correct local Israel time.
11. Do NOT convert [timestamp] to UTC.
12. Do NOT apply timezone transformations.
13. Use [timestamp] as-is for filtering, grouping, and ordering.
14. Use GETDATE() if current local server time is needed, not GETUTCDATE().
15. Use [timestamp] with brackets because timestamp can be treated as a reserved word.
16. Ignore negative consumption deltas unless the user explicitly asks about resets or anomalies.
17. When comparing breakers for today, return one row per breaker with aliases such as BreakerId and daily_consumption.
18. When returning total daily consumption, use aliases such as total_consumption_today.
19. Prefer clear aliases in SQL output.

Database schema:
Table: EnergyData
Columns:
- BreakerId INT
- ActiveEnergy FLOAT
- [timestamp] DATETIME2

Example for hourly consumption:
WITH HourlyData AS (
    SELECT
        BreakerId,
        [timestamp],
        ActiveEnergy - LAG(ActiveEnergy) OVER (
            PARTITION BY BreakerId
            ORDER BY [timestamp]
        ) AS Consumption
    FROM EnergyData
)
SELECT
    BreakerId,
    [timestamp],
    Consumption
FROM HourlyData
WHERE Consumption IS NOT NULL
  AND Consumption >= 0
ORDER BY [timestamp];

Example for daily consumption of breaker 1:
WITH HourlyData AS (
    SELECT
        BreakerId,
        [timestamp],
        ActiveEnergy - LAG(ActiveEnergy) OVER (
            PARTITION BY BreakerId
            ORDER BY [timestamp]
        ) AS Consumption
    FROM EnergyData
    WHERE BreakerId = 1
)
SELECT
    BreakerId,
    CAST([timestamp] AS DATE) AS [day],
    SUM(Consumption) AS daily_consumption
FROM HourlyData
WHERE Consumption IS NOT NULL
  AND Consumption >= 0
GROUP BY BreakerId, CAST([timestamp] AS DATE)
ORDER BY [day];

User question:
${question}
`
    });

    let sqlQuery = (sqlResponse.output_text || "").trim();

    sqlQuery = sqlQuery
      .replace(/```sql/gi, "")
      .replace(/```/g, "")
      .trim();

    console.log("Generated SQL:", sqlQuery);

    const lower = sqlQuery.toLowerCase().trim();

    const forbidden = [
      "delete",
      "update",
      "insert",
      "drop",
      "alter",
      "truncate",
      "create",
      "merge",
      "exec",
      "execute"
    ];

    const isSelect = lower.startsWith("select") || lower.startsWith("with");

    if (!isSelect || forbidden.some(word => lower.includes(word))) {
      return res.status(400).json({
        error: "Only SELECT / WITH SELECT queries are allowed",
        sql: sqlQuery
      });
    }

    const pool = await db.connectionToSqlDB();
    const result = await pool.request().query(sqlQuery);

    console.log("RAW DATA:", result.recordset);
    console.log("JSON DATA:", JSON.stringify(result.recordset, null, 2));

    function formatLocalDateTime(dateValue) {
      const d = new Date(dateValue);
      return (
        d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0") + " " +
        String(d.getHours()).padStart(2, "0") + ":" +
        String(d.getMinutes()).padStart(2, "0") + ":" +
        String(d.getSeconds()).padStart(2, "0")
      );
    }

    const safeData = result.recordset.map(row => {
      const safeRow = { ...row };

      if (row.timestamp instanceof Date) {
        safeRow.local_timestamp = formatLocalDateTime(row.timestamp);
        delete safeRow.timestamp;
      } else if (row.timestamp) {
        safeRow.local_timestamp = row.timestamp;
        delete safeRow.timestamp;
      }

      return safeRow;
    });

    console.log("SAFE DATA:", safeData);
    console.log("SAFE JSON DATA:", JSON.stringify(safeData, null, 2));

    function buildSingleRowAnswer(row) {
      if (row.total_consumption_today !== undefined) {
        return `סך הצריכה להיום הוא ${row.total_consumption_today}.`;
      }

      if (row.daily_consumption !== undefined && row.BreakerId !== undefined && row.day !== undefined) {
        return `הצריכה היומית של מפסק ${row.BreakerId} בתאריך ${row.day} היא ${row.daily_consumption}.`;
      }

      if (row.daily_consumption !== undefined && row.BreakerId !== undefined) {
        return `הצריכה היומית של מפסק ${row.BreakerId} היא ${row.daily_consumption}.`;
      }

      if (row.daily_consumption !== undefined) {
        return `הצריכה היומית היא ${row.daily_consumption}.`;
      }

      if (row.hourly_consumption !== undefined) {
        if (row.local_timestamp) {
          return `הצריכה בשעה ${row.local_timestamp} היא ${row.hourly_consumption}.`;
        }
        return `הצריכה השעתית היא ${row.hourly_consumption}.`;
      }

      if (row.Consumption !== undefined && row.BreakerId !== undefined && row.local_timestamp) {
        return `הנתון שחזר הוא עבור מפסק ${row.BreakerId}, בשעה ${row.local_timestamp}, עם צריכה של ${row.Consumption}.`;
      }

      if (row.Consumption !== undefined && row.BreakerId !== undefined) {
        return `הערך שחזר עבור מפסק ${row.BreakerId} הוא ${row.Consumption}.`;
      }

      if (row.max_consumption !== undefined) {
        return `הצריכה המקסימלית היא ${row.max_consumption}.`;
      }

      if (row.avg_consumption !== undefined) {
        return `הצריכה הממוצעת היא ${row.avg_consumption}.`;
      }

      return null;
    }

    function buildMultiRowAnswer(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const allDailyByBreaker = rows.every(
        row => row.BreakerId !== undefined && row.daily_consumption !== undefined
      );

      if (allDailyByBreaker) {
        const sortedRows = [...rows].sort((a, b) => b.daily_consumption - a.daily_consumption);
        const parts = rows.map(
          row => `מפסק ${row.BreakerId} צרך ${row.daily_consumption}`
        );

        const topRow = sortedRows[0];
        return `${parts.join(", ")}. הצריכה הגבוהה יותר היא של מפסק ${topRow.BreakerId} עם ${topRow.daily_consumption}.`;
      }

      const allConsumptionByBreaker = rows.every(
        row => row.BreakerId !== undefined && row.Consumption !== undefined
      );

      if (allConsumptionByBreaker) {
        const parts = rows.map(row => {
          if (row.local_timestamp) {
            return `מפסק ${row.BreakerId} בשעה ${row.local_timestamp} צרך ${row.Consumption}`;
          }
          return `מפסק ${row.BreakerId} צרך ${row.Consumption}`;
        });

        return parts.join(", ") + ".";
      }

      return null;
    }

    let finalAnswer = "לא נמצאה תשובה.";

    if (safeData.length === 0) {
      finalAnswer = "לא נמצאו נתונים עבור השאילתה המבוקשת.";
    } else if (safeData.length === 1) {
      const builtAnswer = buildSingleRowAnswer(safeData[0]);

      if (builtAnswer) {
        finalAnswer = builtAnswer;
      } else {
        const analysisResponse = await openai.responses.create({
          model: "gpt-4.1-mini",
          input: `
ענה בעברית קצרה, ברורה ומדויקת.
בסס את התשובה רק על הנתונים הבאים.

Rules:
1. local_timestamp is already correct local database time.
2. Do not convert or shift time.
3. Do not invent values.
4. Base the answer only on the SQL result.

User question:
${question}

SQL result:
${JSON.stringify(safeData)}
`
        });

        finalAnswer = analysisResponse.output_text || "לא נמצאה תשובה.";
      }
    } else {
      const builtMultiAnswer = buildMultiRowAnswer(safeData);

      if (builtMultiAnswer) {
        finalAnswer = builtMultiAnswer;
      } else {
        const analysisResponse = await openai.responses.create({
          model: "gpt-4.1-mini",
          input: `
ענה בעברית קצרה, ברורה ומדויקת.

Rules:
1. Base the answer only on the SQL result below.
2. Do not invent values.
3. If multiple breakers are returned, compare them clearly.
4. Use the values exactly as provided.
5. local_timestamp is already correct local database time.
6. Do not convert or shift time.

User question:
${question}

SQL result:
${JSON.stringify(safeData)}
`
        });

        finalAnswer = analysisResponse.output_text || "לא נמצאה תשובה.";
      }
    }

    res.json({
      sql: sqlQuery,
      data: safeData,
      answer: finalAnswer
    });

  } catch (err) {
    console.error("AI Query error:", err);
    res.status(500).json({
      error: "AI query failed",
      detail: err.message
    });
  }
});


app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ detail: "email and password are required" });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ detail: "Invalid email" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    const token = signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    });

    res.cookie(COOKIE_NAME, token, cookieOptions(req));

    return res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
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

app.get("/api/tariffs", authRequired, async (req, res) => {
  try {
    const tariffs = await db.getTariffs();
    const vat = vatRate || 0.18;
    res.json({ tariffs, vat });
  } catch (err) {
    console.error("Error fetching tariffs:", err);
    res.status(500).json({ detail: "Failed to load tariffs" });
  }
});
app.post("/api/change-tariffs", authRequired, async (req, res) => {
  try {
    const { winter, shoulder, summer, vat } = req.body;

    if (
      !winter || !shoulder || !summer ||
      winter.off == null || winter.peak == null ||
      shoulder.off == null || shoulder.peak == null ||
      summer.off == null || summer.peak == null ||
      vat == null
    ) {
      return res.status(400).json({ detail: "Missing required tariff fields" });
    }

    const updatedTariffs = await db.updateAllTariffs({
      winter: {
        off: Number(winter.off),
        peak: Number(winter.peak),
      },
      shoulder: {
        off: Number(shoulder.off),
        peak: Number(shoulder.peak),
      },
      summer: {
        off: Number(summer.off),
        peak: Number(summer.peak),
      },
    });
    // Update the global TARIFFS and vatRate variables with the new values
    vatRate = Number(vat);

    return res.status(200).json({ ok: true, tariffs: updatedTariffs });
  } catch (err) {
    console.error("Error updating tariffs:", err);
    return res.status(500).json({ detail: err?.message || "Failed to update tariffs" });
  }
});

app.get("/api/location", authRequired, async (req, res) => {
  try {
    const location = await db.getLocations();
    res.json({ location });
  } catch (err) {
    console.error("Error fetching location:", err);
    res.status(500).json({ detail: "Failed to load location" });
  }
});

app.post("/api/update-location", authRequired, async (req, res) => {
  try {
    const { location } = req.body;
    if (!location) {
      return res.status(400).json({ detail: "Location is required" });
    }
    await db.updateLocation(location, 32.502, 34.889); // Example constant coordinates
    res.json({ ok: true });
  } catch (err) {
    console.error("Error updating location:", err);
    res.status(500).json({ detail: "Failed to update location" });
  }
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
// City list - Static from JSON file
app.get("/api/cities", async (req, res) => {
  try {
    const cities = citiesConfig;
    res.json({ cities });
  }
  catch (err) {
    console.error("Error loading cities:", err);
    res.status(500).json({ detail: "Failed to load cities" });
  }
});

// Breakers – מוגן (רק למשתמש מחובר)
app.get("/api/breakers", authRequired, async (req, res) => {
  try {
    const breakerList = await db.getBreakerNames();
    res.json(breakerList);
  } catch (err) {
    console.error("Error loading breakers:", err);
    res.status(500).json({ detail: "Failed to load breakers" });
  }
});


// Consumption – מוגן
app.get("/api/consumption", authRequired, async (req, res) => {
  try {
    const breakerId = String(req.query.breaker_id || "").trim();
    const fromDate = String(req.query.from_date || "").trim();
    const toDate = String(req.query.to_date || "").trim();
    const view = String(req.query.view || "hourly").trim();

    if (!breakerId || !BREAKERS[breakerId]) {
      return res.status(400).json({ detail: "Invalid breaker_id" });
    }

    if (!fromDate || !toDate) {
      return res.status(400).json({ detail: "from_date and to_date are required (YYYY-MM-DD)" });
    }

    // Fetch latest tariffs from DB for every request
    const tariffs = await db.getTariffs();

    const { from, to } = rangeToBounds(fromDate, toDate);

    const rawRows = await db.getEnergyData(
      Number(breakerId),
      from.toDate(),
      to.toDate()
    );

    const breakerRows = rawRows
      .map((r) => ({
        breakerId: String(r.breakerId ?? r.BreakerId),
        activeEnergy: Number(r.activeEnergy ?? r.ActiveEnergy ?? 0),
        timestamp: dayjs(r.timestamp ?? r.Timestamp),
      }))
      .filter((r) => r.breakerId === breakerId && r.timestamp.isValid())
      .sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf());

    const deltas = computeDeltas(breakerRows, tariffs).filter(
      (d) => !d.ts.isBefore(from) && !d.ts.isAfter(to)
    );

    const buckets = new Map();

    for (const dlt of deltas) {
      const key =
        view === "daily"
          ? dlt.ts.format("YYYY-MM-DD")
          : view === "monthly"
            ? dlt.ts.format("YYYY-MM")
            : dlt.ts.startOf("hour").format("YYYY-MM-DD HH:00");

      const b = buckets.get(key) || {
        peak_kwh: 0,
        off_kwh: 0,
        peak_amount: 0,
        off_amount: 0,
      };

      if (dlt.peak) {
        b.peak_kwh += dlt.kwh;
        b.peak_amount += dlt.amount;
      } else {
        b.off_kwh += dlt.kwh;
        b.off_amount += dlt.amount;
      }

      buckets.set(key, b);
    }

    const allPeriods = [];
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
      let cur = from.clone().startOf("hour");
      while (!cur.isAfter(to)) {
        allPeriods.push(cur.format("YYYY-MM-DD HH:00"));
        cur = cur.add(1, "hour");
      }
    }

    const outRows = allPeriods.map((period) => {
      const b = buckets.get(period);

      const peak_kwh = b ? round3(b.peak_kwh) : 0;
      const off_kwh = b ? round3(b.off_kwh) : 0;
      const kwh = round3(peak_kwh + off_kwh);
      const peak_amount = b ? round3(b.peak_amount) : 0;
      const off_amount = b ? round3(b.off_amount) : 0;
      const amount = round3(peak_amount + off_amount);

      let repTime;
      if (view === "daily") {
        repTime = dayjs.tz(`${period} 12:00`, TZ);
      } else if (view === "monthly") {
        repTime = dayjs.tz(`${period}-15 12:00`, TZ);
      } else {
        repTime = dayjs.tz(period, "YYYY-MM-DD HH:00", TZ);
      }

      const season = getSeason(repTime);

      if (view === "daily" || view === "monthly") {
        return { timestamp: period, season, peak_kwh, off_kwh, kwh, peak_amount, off_amount, amount };
      }

      const type =
        peak_kwh > 0 && off_kwh === 0 ? "Peak" :
          off_kwh > 0 && peak_kwh === 0 ? "Off-Peak" :
            "Mixed";

      const rate =
        type === "Peak" ? tariffs[season].peak :
          type === "Off-Peak" ? tariffs[season].off :
            "-";

      return { timestamp: period, season, type, kwh, rate, peak_kwh, off_kwh, amount };
    });

    const peak_kwh = round3(deltas.filter((x) => x.peak).reduce((s, x) => s + x.kwh, 0));
    const offpeak_kwh = round3(deltas.filter((x) => !x.peak).reduce((s, x) => s + x.kwh, 0));
    const total_kwh = round3(peak_kwh + offpeak_kwh);

    const peak_amount = round3(deltas.filter((x) => x.peak).reduce((s, x) => s + x.amount, 0));
    const offpeak_amount = round3(deltas.filter((x) => !x.peak).reduce((s, x) => s + x.amount, 0));
    const total_amount = round3(peak_amount + offpeak_amount);

    return res.json({
      invoice_no: buildInvoiceNo(),
      generated_at: dayjs().tz(TZ).format("YYYY-MM-DD HH:mm:ss"),
      tz: TZ,
      breaker_ref: breakerId,
      breaker_name: BREAKERS[breakerId]?.name || `Breaker ${breakerId}`,
      from: from.format("YYYY-MM-DD"),
      to: to.format("YYYY-MM-DD"),
      total_kwh,
      peak_kwh,
      offpeak_kwh,
      peak_amount,
      offpeak_amount,
      total_amount,
      rows: outRows,
    });
  } catch (err) {
    console.error("Consumption API error:", err);
    return res.status(500).json({ detail: err?.message || "Server error" });
  }
});

app.get("/api/breakers/consumption", authRequired, async (req, res) => {
  try {
    const data = await db.getBreakersLastDailyAndHourlyConsumption();

    res.json({
      success: true,
      summary: data.summary,
      hourly: data.hourly
    });
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch breakers consumption data"
    });
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
    const username = String(req.body?.username || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "").trim().toLowerCase();

    if (!username || !email || !password || !role) {
      return res.status(400).json({ detail: "All fields are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ detail: "Invalid email format" });
    }

    const allowedRoles = ["admin", "user"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ detail: "Invalid role" });
    }

    const existingEmail = await db.getUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ detail: "Email already exists" });
    }

    const existingUsername = await db.getUserByUsername(username);
    if (existingUsername) {
      return res.status(409).json({ detail: "Username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.createUser(username, email, passwordHash, role);

    return res.status(201).json({
      ok: true,
      user: {
        username,
        email,
        role
      }
    });
  } catch (err) {
    return res.status(500).json({ detail: err?.message || "Registration failed" });
  }
});




// =========================
// 12) Start server
// =========================
const preferred = pickPreferredIp();
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Energy API + UI running");
});