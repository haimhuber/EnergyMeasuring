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
  breakersConfig.breakers.map(item => {
    const [id, name] = item.split(" - ");
    return [
      id.trim(),
      {
        id: id.trim(),
        name: name.trim()
      }
    ];
  })
);
// ****************************************


// ---- IEC TOU tariffs (before VAT), NIS/kWh ----
const TARIFFS = {
  winter: { off: 0.4022, peak: 0.9774 },
  shoulder: { off: 0.3945, peak: 0.4293 },
  summer: { off: 0.4358, peak: 1.4597 },
};

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
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV not found: ${CSV_PATH}`);
  return fs.readFileSync(CSV_PATH, "utf8");
}

function parseCsvRows(csvText) {
  const { data, errors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  if (errors?.length) {
    const msg = errors.slice(0, 3).map((e) => e.message).join(" | ");
    throw new Error(`CSV parse errors: ${msg}`);
  }

  return (data || [])
    .map((r) => {
      const breakerId =
        r.BreakerId ?? r.breakerId ?? r.breaker_id ?? r.breaker ?? r.id;
      const activeEnergy =
        r.ActiveEnergy ?? r.activeEnergy ?? r.active_energy ?? r.energy;
      const ts = r.timestamp ?? r.time ?? r.date;

      if (breakerId == null || activeEnergy == null || !ts) return null;

      const t = dayjs(ts).tz(TZ);
      if (!t.isValid()) return null;

      return {
        breakerId: Number(breakerId),
        activeEnergy: Number(activeEnergy),
        timestamp: t,
      };
    })
    .filter(Boolean);
}

// ---- Tariff helpers ----
function getSeason(t) {
  const m = t.month() + 1;
  if (m === 12 || m === 1 || m === 2) return "winter";
  if (m >= 6 && m <= 9) return "summer";
  return "shoulder";
}

function isPeak(t) {
  const d = t.day(); // Sun=0..Sat=6
  const isSunThu = d >= 0 && d <= 4;
  if (!isSunThu) return false;

  const hour = t.hour();
  const season = getSeason(t);
  if (season === "summer") return hour >= 17 && hour < 23;
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

    // ignore invalid / reset / negative
    if (!Number.isFinite(delta) || delta < 0) { prev = row; continue; }

    // ✅ If it's exactly 0 - ignore (prevents empty hours)
    if (delta === 0) { prev = row; continue; }

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

// Serve UI (and vendor files if you add them)
app.use("/", express.static(PUBLIC_DIR));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, tz: TZ, csv_path: CSV_PATH, now: dayjs().tz(TZ).format() });
});

/**
 * ✅ NEW: available dates endpoint
 * Returns dates (YYYY-MM-DD) that exist for the selected breaker in the CSV.
 * Use this in the UI to prevent choosing empty days.
 */
app.get("/api/available-dates", (req, res) => {
  try {
    const breakerId = Number(req.query.breaker_id);
    if (!breakerId || !BREAKERS[breakerId]) {
      return res.status(400).json({ detail: "Invalid breaker_id" });
    }

    const rows = parseCsvRows(safeReadCsvText())
      .filter((r) => r.breakerId === breakerId)
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
    res.status(500).json({ detail: err?.message || "Server error" });
  }
});


app.get("/api/breakers", (req, res) => {
  const list = Object.values(BREAKERS).map((b) => ({ id: b.id, name: b.name }));
  res.json(list);
} );



app.get("/api/consumption", (req, res) => {
  try {
    const breakerId = Number(req.query.breaker_id);
    const fromDate = String(req.query.from_date || "");
    const toDate = String(req.query.to_date || "");
    const view = String(req.query.view || "hourly");

    if (!breakerId || !BREAKERS[breakerId]) return res.status(400).json({ detail: "Invalid breaker_id" });
    if (!fromDate || !toDate) return res.status(400).json({ detail: "from_date and to_date are required (YYYY-MM-DD)" });
    if (view !== "hourly" && view !== "daily") return res.status(400).json({ detail: 'view must be "hourly" or "daily"' });

    const { from, to } = rangeToBounds(fromDate, toDate);
    const rows = parseCsvRows(safeReadCsvText());

    const breakerRows = rows
      .filter((r) => r.breakerId === breakerId)
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

    // ✅ if somehow a bucket got to 0 (edge cases) - filter it out
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
      .filter((r) => Number(r.kwh || 0) > 0); // ✅ final guard

    const peak_kwh = round3(deltas.filter((x) => x.peak).reduce((s, x) => s + x.kwh, 0));
    const offpeak_kwh = round3(deltas.filter((x) => !x.peak).reduce((s, x) => s + x.kwh, 0));
    const total_kwh = round3(peak_kwh + offpeak_kwh);

    const peak_amount = round3(deltas.filter((x) => x.peak).reduce((s, x) => s + x.amount, 0));
    const offpeak_amount = round3(deltas.filter((x) => !x.peak).reduce((s, x) => s + x.amount, 0));
    const total_amount = round3(peak_amount + offpeak_amount);

    res.json({
      invoice_no: buildInvoiceNo(),
      generated_at: dayjs().tz(TZ).format("YYYY-MM-DD HH:mm:ss"),
      tz: TZ,
      breaker_ref: breakerId,
      breaker_name: BREAKERS[breakerId],
      from: from.format("YYYY-MM-DD"),
      to: to.format("YYYY-MM-DD"),
      tariffs_before_vat: TARIFFS,
      peak_definition: {
        days: "Sun–Thu only",
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
    res.status(500).json({ detail: err?.message || "Server error" });
  }
});

const preferred = pickPreferredIp();
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Energy API + UI running");
  console.log(`- URL: http://${preferred}:${PORT}/`);
  console.log(`- CSV: ${CSV_PATH}`);
  console.log("✅ New endpoint: /api/available-dates?breaker_id=1");
});