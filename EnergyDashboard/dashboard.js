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
import breakersConfig from "../energyComsamption/breakerConfig.json" with { type: "json" };

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Jerusalem";
const PORT = Number(process.env.PORT || 8000);

const CSV_DIR =
  process.env.CSV_DIR ||
  "C:\\Users\\User\\Downloads\\EnergyMeasuring\\energyComsamption";
const CSV_FILE = process.env.CSV_FILE || "energyData.csv";
const CSV_PATH = path.join(CSV_DIR, CSV_FILE);

const PUBLIC_DIR = path.join(process.cwd(), "public");

// ---- Breakers ----
// Load breakers from config and build a map: { id: { id, name } }
const BREAKERS = Object.fromEntries(
  (breakersConfig?.breakers || []).map((item) => {
    const [id, name] = String(item).split(" - ");
    const sid = String(id || "").trim();
    const sname = String(name || "").trim();
    return [sid, { id: sid, name: sname || `Breaker ${sid}` }];
  })
);

// ---- IEC TOU tariffs (before VAT), NIS/kWh ----
const TARIFFS = {
  winter: { off: 0.4022, peak: 0.9774 },
  shoulder: { off: 0.3945, peak: 0.4293 },
  summer: { off: 0.4358, peak: 1.4597 },
};
const VAT_RATE = Number(process.env.VAT_RATE ?? 0.18);

// ---- Network helpers ----
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

// ---- CSV helpers ----
function safeReadCsvText() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }
  let txt = fs.readFileSync(CSV_PATH, "utf8");

  // Remove UTF-8 BOM if exists
  if (txt && txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);

  return txt;
}

function normalizeRowFields(r) {
  const breakerId = r?.BreakerId ?? r?.breakerId ?? r?.breaker_id ?? r?.breaker ?? r?.id;
  const activeEnergy = r?.ActiveEnergy ?? r?.activeEnergy ?? r?.active_energy ?? r?.energy;
  const tsRaw = r?.timestamp ?? r?.time ?? r?.date;

  if (breakerId == null || activeEnergy == null || !tsRaw) return null;

  // NOTE: אם אתה יודע בוודאות שה-CSV כתוב ISO עם Z (UTC) ורוצה להמיר לישראל:
  // תחליף את הלוגיקה כאן. כרגע אני משמר "שעת קיר" ומסיר Z אם קיים כדי לא להזיז שעתיים.
  let tsStr = String(tsRaw).trim();
  if (tsStr.endsWith("Z")) tsStr = tsStr.replace(/Z$/, "");

  const t = dayjs.tz(tsStr, TZ);
  if (!t.isValid()) return null;

  const bid = Number(breakerId);
  const ae = Number(String(activeEnergy).trim().replace(/,/g, "")); // סניטציה ל-1,234

  if (!Number.isFinite(bid) || bid <= 0) return null;
  if (!Number.isFinite(ae)) return null;

  return { breakerId: bid, activeEnergy: ae, timestamp: t };
}

// ✅ FALLBACK: פרסור ידני ל-3 עמודות במקרה של "Too many fields"
function parseCsvRowsFallback3cols(csvText) {
  const lines = String(csvText || "").split(/\r?\n/);
  const out = [];
  const bad = [];

  if (!lines.length) return { rows: [], bad };

  // header exists?
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
      continue; // דלג
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

// ✅ PapaParse + fallback קשיח
function parseCsvRows(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // נשאיר strings וננרמל לבד
  });

  const errors = parsed.errors || [];
  const hasTooManyFields = errors.some((e) =>
    String(e?.message || "").toLowerCase().includes("too many fields")
  );

  // אם יש "Too many fields" -> fallback ל-3 עמודות (מדלג על שורות בעייתיות)
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

  // אם יש שגיאות אחרות -> נחזיר שגיאה עם דגימה
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

// ---- Tariff helpers ----
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

function computeDeltas(sortedRows) {
  const out = [];
  let prev = null;

  for (const row of sortedRows) {
    if (!prev) { prev = row; continue; }

    const delta = row.activeEnergy - prev.activeEnergy;

    if (!Number.isFinite(delta) || delta < 0) { prev = row; continue; }
    if (delta === 0) { prev = row; continue; } // ignore 0

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

function round3(n) { return Math.round(n * 1000) / 1000; }
function buildInvoiceNo() { return `INV-${dayjs().tz(TZ).format("YYYYMMDD-HHmmss")}`; }

// ---- App ----
const app = express();
app.use(cors());
app.use(express.json());

app.use("/", express.static(PUBLIC_DIR));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, tz: TZ, csv_path: CSV_PATH, now: dayjs().tz(TZ).format() });
});

app.get("/api/breakers", (req, res) => {
  const list = Object.values(BREAKERS).map((b) => ({ id: b.id, name: b.name }));
  res.json(list);
});

app.get("/api/available-dates", (req, res) => {
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

app.get("/api/consumption", (req, res) => {
  try {
    const breakerId = String(req.query.breaker_id || "").trim();
    const fromDate = String(req.query.from_date || "").trim();
    const toDate = String(req.query.to_date || "").trim();
    const view = String(req.query.view || "hourly").trim();

    if (!breakerId || !BREAKERS[breakerId]) return res.status(400).json({ detail: "Invalid breaker_id" });
    if (!fromDate || !toDate) return res.status(400).json({ detail: "from_date and to_date are required (YYYY-MM-DD)" });
    if (view !== "hourly" && view !== "daily") return res.status(400).json({ detail: 'view must be "hourly" or "daily"' });

    const { from, to } = rangeToBounds(fromDate, toDate);

    const rows = parseCsvRows(safeReadCsvText());

    const breakerRows = rows
      .filter((r) => String(r.breakerId) === breakerId)
      .sort((a, b) => a.timestamp.valueOf() - b.timestamp.valueOf());

    const deltas = computeDeltas(breakerRows).filter(
      (d) => !d.ts.isBefore(from) && !d.ts.isAfter(to)
    );

    const buckets = new Map();
    for (const dlt of deltas) {
      const key =
        view === "daily"
          ? dlt.ts.format("YYYY-MM-DD")
          : dlt.ts.startOf("hour").format("YYYY-MM-DD HH:00");

      const b = buckets.get(key) || { peak_kwh: 0, off_kwh: 0, peak_amount: 0, off_amount: 0 };

      if (dlt.peak) { b.peak_kwh += dlt.kwh; b.peak_amount += dlt.amount; }
      else { b.off_kwh += dlt.kwh; b.off_amount += dlt.amount; }

      buckets.set(key, b);
    }

    const keys = Array.from(buckets.keys()).sort();

    const outRows = keys
      .map((k) => {
        const b = buckets.get(k);
        const peak_kwh = round3(b.peak_kwh);
        const off_kwh = round3(b.off_kwh);
        const kwh = round3(peak_kwh + off_kwh);

        const peak_amount = round3(b.peak_amount);
        const off_amount = round3(b.off_amount);
        const amount = round3(peak_amount + off_amount);

        const repTime =
          view === "daily"
            ? dayjs.tz(k + " 12:00", TZ)
            : dayjs.tz(k, "YYYY-MM-DD HH:00", TZ);

        const season = getSeason(repTime);

        if (view === "daily") {
          return { timestamp: k, season, peak_kwh, off_kwh, kwh, peak_amount, off_amount, amount };
        }

        const type =
          peak_kwh > 0 && off_kwh === 0 ? "Peak" :
          off_kwh > 0 && peak_kwh === 0 ? "Off-Peak" :
          "Mixed";

        const rate =
          type === "Peak" ? TARIFFS[season].peak :
          type === "Off-Peak" ? TARIFFS[season].off :
          "-";

        return { timestamp: k, season, type, kwh, rate, peak_kwh, off_kwh, amount };
      })
      .filter((r) => Number(r.kwh || 0) > 0);

    const peak_kwh = round3(deltas.filter((x) => x.peak).reduce((s, x) => s + x.kwh, 0));
    const offpeak_kwh = round3(deltas.filter((x) => !x.peak).reduce((s, x) => s + x.kwh, 0));
    const total_kwh = round3(peak_kwh + offpeak_kwh);

    const peak_amount = round3(deltas.filter((x) => x.peak).reduce((s, x) => s + x.amount, 0));
    const offpeak_amount = round3(deltas.filter((x) => !x.peak).reduce((s, x) => s + x.amount, 0));
    const total_amount = round3(peak_amount + offpeak_amount);

    const tariffs_with_vat = Object.fromEntries(
      Object.entries(TARIFFS).map(([season, vals]) => [season, {
        off: Number((vals.off * (1 + VAT_RATE)).toFixed(4)),
        peak: Number((vals.peak * (1 + VAT_RATE)).toFixed(4)),
      }])
    );

    res.json({
      invoice_no: buildInvoiceNo(),
      generated_at: dayjs().tz(TZ).format("YYYY-MM-DD HH:mm:ss"),
      tz: TZ,
      breaker_ref: breakerId,
      breaker_name: BREAKERS[breakerId],
      from: from.format("YYYY-MM-DD"),
      to: to.format("YYYY-MM-DD"),
      tariffs_before_vat: TARIFFS,
      tariffs_with_vat,
      peak_definition: {
        days: "Winter: daily 17:00–22:00; Shoulder: Sun–Thu only",
        winter_shoulder_hours: "17:00–22:00",
        summer_hours: "17:00–23:00",
      },
      total_kwh,
      peak_kwh,
      offpeak_kwh,
      peak_amount,
      offpeak_amount,
      total_amount,
      rows: outRows
    });
  } catch (err) {
    res.status(500).json({ detail: err?.message || "Server error", csv_path: CSV_PATH });
  }
});

// ✅ Debug endpoint: returns last parsed rows for breaker (full rows)
app.get("/api/debug-rows", (req, res) => {
  try {
    const breakerId = String(req.query.breaker_id || "").trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));

    if (!breakerId || !BREAKERS[breakerId]) return res.status(400).json({ detail: "Invalid breaker_id" });

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

const preferred = pickPreferredIp();
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Energy API + UI running");
  console.log(`- URL: http://${preferred}:${PORT}/`);
  console.log(`- CSV: ${CSV_PATH}`);
  console.log("✅ Endpoints: /api/health /api/breakers /api/consumption /api/debug-rows /api/available-dates");
});