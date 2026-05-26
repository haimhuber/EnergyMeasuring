/**
 * db.js — Unified database driver
 * Supports SQL Server (mssql) and PostgreSQL (Supabase)
 * Set DB_DRIVER=mssql or DB_DRIVER=postgres in .env.unified
 * Set PG_DUAL_WRITE=true to sync users/tariffs/location to both DBs
 */

import dotenv from "dotenv";
dotenv.config({ path: "./.env.unified" });

const DRIVER     = process.env.DB_DRIVER     || "mssql";
const DUAL_WRITE = process.env.PG_DUAL_WRITE === "true";

console.log(`🗄️  DB Driver: ${DRIVER} | Dual Write: ${DUAL_WRITE}`);

// ============================================
// MSSQL
// ============================================
let mssqlPool;

async function mssqlConnect() {
    if (!mssqlPool) {
        const { default: sql } = await import("mssql");
        mssqlPool = await sql.connect({
            user:     process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server:   process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options:  { encrypt: false, trustServerCertificate: true, useUTC: false },
            pool:     { max: 10, min: 0, idleTimeoutMillis: 30000 },
        });
        console.log("✅ Connected to SQL Server");
    }
    return mssqlPool;
}

// ============================================
// PostgreSQL
// ============================================
let pgPool;

async function pgConnect() {
    if (!pgPool) {
        const { default: pg } = await import("pg");
        pgPool = new pg.Pool({
            host:     process.env.PG_HOST,
            port:     Number(process.env.PG_PORT || 5432),
            database: process.env.PG_DATABASE || "postgres",
            user:     process.env.PG_USER,
            password: process.env.PG_PASSWORD,
            ssl:      process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
        });
        pgPool.on("connect", () => console.log("✅ Connected to PostgreSQL"));
        pgPool.on("error",   (err) => console.error("PG pool error:", err));
    }
    return pgPool;
}

async function pgQuery(text, params = []) {
    const pool = await pgConnect();
    const res = await pool.query(text, params);
    return res.rows;
}

// ============================================
// connectionToSqlDB
// ============================================
export async function connectionToSqlDB() {
    if (DRIVER === "postgres") return await pgConnect();
    return await mssqlConnect();
}

// ── Breakers ──────────────────────────────────────────────
async function getBreakerNames() {
    if (DRIVER === "postgres") {
        const rows = await pgQuery(`SELECT * FROM get_breakers_formatted()`);
        return rows.map(r => r.displayName);
    }
    const pool = await mssqlConnect();
    const result = await pool.request().execute("GetBreakersFormatted");
    return result.recordset.map(r => r.displayName);
}

async function getBreakerNamesInitial() {
    if (DRIVER === "postgres") {
        return await pgQuery(`SELECT * FROM get_breakers_formatted()`);
    }
    const pool = await mssqlConnect();
    const result = await pool.request().execute("GetBreakersFormatted");
    return result.recordset;
}

// ── Tariffs ───────────────────────────────────────────────
async function getTariffs() {
    if (DRIVER === "postgres") {
        const rows = await pgQuery(`SELECT * FROM get_tariffs()`);
        const tariffs = {};
        for (const row of rows) {
            if (row.season) tariffs[row.season] = { off: Number(row.off_rate), peak: Number(row.peak_rate) };
        }
        return tariffs;
    }
    const pool = await mssqlConnect();
    const result = await pool.request().execute("GetTariffs");
    const tariffs = {};
    for (const row of result.recordset) {
        if (row.season) tariffs[row.season] = { off: row.off_rate, peak: row.peak_rate };
    }
    return tariffs;
}

async function updateAllTariffs(tariffs) {
    if (DRIVER === "postgres") {
        return await pgQuery(
            `SELECT * FROM update_all_tariffs($1,$2,$3,$4,$5,$6)`,
            [tariffs.winter.off, tariffs.winter.peak,
             tariffs.shoulder.off, tariffs.shoulder.peak,
             tariffs.summer.off, tariffs.summer.peak]
        );
    }

    const { default: sql } = await import("mssql");
    const pool = await mssqlConnect();
    const result = await pool.request()
        .input("WinterOffRate",    sql.Decimal(10,4), tariffs.winter.off)
        .input("WinterPeakRate",   sql.Decimal(10,4), tariffs.winter.peak)
        .input("ShoulderOffRate",  sql.Decimal(10,4), tariffs.shoulder.off)
        .input("ShoulderPeakRate", sql.Decimal(10,4), tariffs.shoulder.peak)
        .input("SummerOffRate",    sql.Decimal(10,4), tariffs.summer.off)
        .input("SummerPeakRate",   sql.Decimal(10,4), tariffs.summer.peak)
        .execute("UpdateAllTariffs");

    // Dual write → Supabase
    if (DUAL_WRITE) {
        try {
            await pgQuery(
                `SELECT * FROM update_all_tariffs($1,$2,$3,$4,$5,$6)`,
                [tariffs.winter.off, tariffs.winter.peak,
                 tariffs.shoulder.off, tariffs.shoulder.peak,
                 tariffs.summer.off, tariffs.summer.peak]
            );
            console.log("✅ Tariffs synced to Supabase");
        } catch (err) {
            console.error("❌ Failed to sync tariffs to Supabase:", err.message);
        }
    }

    return result.recordset;
}

// ── EnergyData ────────────────────────────────────────────
async function getEnergyData(breakerId, fromDate, toDate) {
    if (DRIVER === "postgres") {
        const rows = await pgQuery(
            `SELECT * FROM get_consumption($1, $2, $3)`,
            [breakerId, fromDate, toDate]
        );
        return rows.map(r => ({
            BreakerId:    r.BreakerId,
            ActiveEnergy: r.ActiveEnergy,
            timestamp:    r.timestamp,
        }));
    }
    const { default: sql } = await import("mssql");
    const pool = await mssqlConnect();
    const result = await pool.request()
        .input("BreakerId", sql.Int, breakerId)
        .input("FromDate",  sql.DateTime2, fromDate)
        .input("ToDate",    sql.DateTime2, toDate)
        .execute("GetConsumption");
    return result.recordset;
}

// ── Users ─────────────────────────────────────────────────
async function getUserByEmail(email) {
    if (DRIVER === "postgres") {
        const rows = await pgQuery(`SELECT * FROM get_user_by_email($1)`, [email]);
        return rows[0] || null;
    }
    const { default: sql } = await import("mssql");
    const pool = await mssqlConnect();
    const result = await pool.request()
        .input("email", sql.NVarChar(255), email)
        .execute("GetUserByEmail");
    return result.recordset[0] || null;
}

async function getUserByUsername(username) {
    if (DRIVER === "postgres") {
        const rows = await pgQuery(`SELECT * FROM get_user_by_username($1)`, [username]);
        return rows[0] || null;
    }
    const { default: sql } = await import("mssql");
    const pool = await mssqlConnect();
    const result = await pool.request()
        .input("username", sql.NVarChar(50), username)
        .execute("GetUserByUsername");
    return result.recordset?.[0] || null;
}

async function createUser(username, email, passwordHash, role) {
    if (DRIVER === "postgres") {
        const rows = await pgQuery(
            `SELECT * FROM add_user($1,$2,$3,$4)`,
            [username, email, passwordHash, role]
        );
        return rows[0] || null;
    }

    const { default: sql } = await import("mssql");
    const pool = await mssqlConnect();
    const result = await pool.request()
        .input("username",      sql.NVarChar(50),  username)
        .input("email",         sql.NVarChar(255), email)
        .input("password_hash", sql.NVarChar(255), passwordHash)
        .input("role",          sql.NVarChar(50),  role)
        .execute("AddUser");

    // Dual write → Supabase
    if (DUAL_WRITE) {
        try {
            await pgQuery(
                `SELECT * FROM add_user($1,$2,$3,$4)`,
                [username, email, passwordHash, role]
            );
            console.log("✅ User synced to Supabase:", email);
        } catch (err) {
            console.error("❌ Failed to sync user to Supabase:", err.message);
        }
    }

    return result.recordset[0] || null;
}

// ── Location ──────────────────────────────────────────────
async function getLocations() {
    if (DRIVER === "postgres") {
        const rows = await pgQuery(`SELECT * FROM get_locations()`);
        return rows.map(r => ({ LocationName: r.LocationName, Latitude: r.Latitude, Longitude: r.Longitude }));
    }
    const pool = await mssqlConnect();
    const result = await pool.request().execute("GetLocations");
    return result.recordset;
}

async function updateLocation(locationName, latitude, longitude) {
    if (DRIVER === "postgres") {
        await pgQuery(`SELECT update_location($1,$2,$3)`, [locationName, latitude, longitude]);
        return;
    }

    const { default: sql } = await import("mssql");
    const pool = await mssqlConnect();
    await pool.request()
        .input("LocationName", sql.NVarChar(100), locationName)
        .input("Latitude",     sql.Float, latitude)
        .input("Longitude",    sql.Float, longitude)
        .execute("UpdateLocation");

    // Dual write → Supabase
    if (DUAL_WRITE) {
        try {
            await pgQuery(`SELECT update_location($1,$2,$3)`, [locationName, latitude, longitude]);
            console.log("✅ Location synced to Supabase");
        } catch (err) {
            console.error("❌ Failed to sync location to Supabase:", err.message);
        }
    }
}

// ── Dashboard ─────────────────────────────────────────────
async function getBreakersLastDailyAndHourlyConsumption() {
    if (DRIVER === "postgres") {
        const rows = await pgQuery(`SELECT * FROM get_breakers_consumption_summary()`);
        return { summary: rows, hourly: [] };
    }
    const pool = await mssqlConnect();
    try {
        const result = await pool.request().execute("GetBreakersLastDailyAndHourlyConsumption");
        return { summary: result.recordsets[0] || [], hourly: result.recordsets[1] || [] };
    } catch (err) {
        console.error("Error fetching dashboard summary:", err);
        return { summary: [], hourly: [] };
    }
}

// ── CSV legacy ────────────────────────────────────────────
async function csvHandler() {
    if (DRIVER === "postgres") {
        return await pgQuery(`SELECT * FROM energydata LIMIT 1000`);
    }
    const pool = await mssqlConnect();
    const result = await pool.request().query("SELECT * FROM EnergyData");
    return result.recordset;
}

export default {
    connectionToSqlDB,
    csvHandler,
    getTariffs,
    updateAllTariffs,
    getUserByUsername,
    getUserByEmail,
    createUser,
    getBreakerNames,
    getEnergyData,
    getBreakerNamesInitial,
    getBreakersLastDailyAndHourlyConsumption,
    getLocations,
    updateLocation,
};