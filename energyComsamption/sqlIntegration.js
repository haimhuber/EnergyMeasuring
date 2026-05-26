const sql = require("mssql");
const { Pool } = require("pg");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const dotenv = require("dotenv");
const path = require("path");

dayjs.extend(utc);
dayjs.extend(timezone);

dotenv.config({
  path: path.join(__dirname, "../EnergyDashboard/.env.unified"),
});

const { timestampFunction } = require("./timestamp");
const { storeData } = require("./energyDatacsv");

const sqlTable   = process.env.DB_TABLE;
const DUAL_WRITE = process.env.PG_DUAL_WRITE === "true";
const TZ         = "Asia/Jerusalem";

// ── PostgreSQL (Supabase) ─────────────────────────────────
let pgPool;

function getPgPool() {
  if (!pgPool) {
    pgPool = new Pool({
      host:     process.env.PG_HOST,
      port:     Number(process.env.PG_PORT || 5432),
      database: process.env.PG_DATABASE || "postgres",
      user:     process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      ssl:      { rejectUnauthorized: false },
    });
  }
  return pgPool;
}

async function writeToPostgres(data) {
  try {
    const pool = getPgPool();
    const ts   = dayjs().tz(TZ).format("YYYY-MM-DD HH:mm:ss");

    for (let i = 0; i < data.length; i++) {
      const energy = data[i];
      if (energy === null || energy === undefined) continue;

      await pool.query(
        `INSERT INTO energydata (breakerid, activeenergy, ts) VALUES ($1, $2, $3)`,
        [i + 1, energy, ts]
      );
    }

    console.log(`✅ Written to Supabase @ ${ts}`, { timestamp: timestampFunction() });
  } catch (err) {
    console.error("❌ Error writing to Supabase:", err.message || err);
  }
}

// ── Parse OPC UA data (Float32Array or other formats) ─────
function parseOpcData(raw) {
  if (raw === null || raw === undefined) return null;

  // Float32Array / TypedArray
  if (raw?.buffer instanceof ArrayBuffer) {
    return [...raw].map(v => Math.round(v));
  }

  // Array — might contain TypedArray as first element
  if (Array.isArray(raw)) {
    if (raw[0]?.buffer instanceof ArrayBuffer) {
      return [...raw[0]].map(v => Math.round(v));
    }
    return raw.map(v => parseFloat(v));
  }

  // Comma-separated string
  if (typeof raw === "string") {
    return raw.split(",").map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
  }

  // Single value
  return [parseFloat(raw)];
}

// ── SQL Server ────────────────────────────────────────────
async function saveDataToSQLServer(rawData, numberOfNodes) {
  let pool;

  const data = parseOpcData(rawData);

  if (!data || data.length === 0) {
    console.warn("⚠️  No valid data to save.");
    return;
  }

  console.log(`📊 Parsed ${data.length} values from OPC UA`);

  try {
    const dbConfig = {
      server:   process.env.DB_SERVER,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      options:  { encrypt: false, trustServerCertificate: true },
    };

    if (!dbConfig.server)   throw new Error("Missing DB_SERVER in .env.unified");
    if (!dbConfig.user)     throw new Error("Missing DB_USER in .env.unified");
    if (!dbConfig.password) throw new Error("Missing DB_PASSWORD in .env.unified");
    if (!dbConfig.database) throw new Error("Missing DB_NAME in .env.unified");
    if (!sqlTable)          throw new Error("Missing DB_TABLE in .env.unified");

    pool = await sql.connect(dbConfig);
    console.log("Connected to SQL Server.", { timestamp: timestampFunction() });

    for (let i = 0; i < data.length; i++) {
      const activeEnergy = data[i];

      if (activeEnergy === undefined || activeEnergy === null) {
        console.warn(`Skipping node ${i + 1}: activeEnergy is missing`);
        continue;
      }

      const request = pool.request();
      request.input("breakerId",    sql.Int,   i + 1);
      request.input("activeEnergy", sql.Float, activeEnergy);

      await request.query(`
        INSERT INTO ${sqlTable} (breakerId, activeEnergy)
        VALUES (@breakerId, @activeEnergy)
      `);
    }

    await storeData(
      data.map((energy, idx) => ({
        BreakerId:    idx + 1,
        ActiveEnergy: energy,
      }))
    );

    console.log("End of SQL Server operations.", { timestamp: timestampFunction() });

    // ── Dual write to Supabase ──
    if (DUAL_WRITE) {
      await writeToPostgres(data);
    }

  } catch (err) {
    console.error("Error saving to SQL Server:", err.message || err);
  } finally {
    try {
      if (pool) {
        await pool.close();
        console.log("SQL connection closed.", { timestamp: timestampFunction() });
      }
    } catch (closeErr) {
      console.error("Error closing SQL connection:", closeErr.message || closeErr);
    }
  }
}

module.exports = { saveDataToSQLServer };