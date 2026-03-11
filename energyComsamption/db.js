import sql from "mssql";
import dotenv from "dotenv";

dotenv.config({ path: "./.env.unified" });

let poolPromise;

function connectionToSqlDB() {
    if (!poolPromise) {
        const config = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                useUTC: false,
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000,
            },
        };

        poolPromise = sql.connect(config)
            .then((pool) => {
                console.log("Connected to SQL Server");
                return pool;
            })
            .catch((err) => {
                poolPromise = null;
                console.error("Database connection failed:", err);
                throw err;
            });
    }

    return poolPromise;
}

async function csvHandler() {
    const pool = await connectionToSqlDB();

    if (!pool) {
        console.error('Unable to connect to the database. CSV handling aborted.');
        return;
    }

    try {
        const result = await pool.request().query('SELECT * FROM EnergyData');
        const data = result.recordset;
        return data;
    } catch (err) {
        console.error('Error executing query:', err);
    }
}

/* ---------- Update Tariffs ---------- */
async function updateAllTariffs(tariffs) {
    const pool = await connectionToSqlDB();

    const result = await pool
        .request()
        .input("WinterOffRate", sql.Decimal(10, 4), tariffs.winter.off)
        .input("WinterPeakRate", sql.Decimal(10, 4), tariffs.winter.peak)
        .input("ShoulderOffRate", sql.Decimal(10, 4), tariffs.shoulder.off)
        .input("ShoulderPeakRate", sql.Decimal(10, 4), tariffs.shoulder.peak)
        .input("SummerOffRate", sql.Decimal(10, 4), tariffs.summer.off)
        .input("SummerPeakRate", sql.Decimal(10, 4), tariffs.summer.peak)
        .execute("UpdateAllTariffs");

    return result.recordset;
}


/* ---------- Get Tariffs ---------- */

async function getTariffs() {
    const pool = await connectionToSqlDB();

    if (!pool) {
        console.error('Unable to connect to the database.');
        return;
    }

    try {
        const result = await pool.request().execute('GetTariffs');
        const rows = result.recordset;
        // המרה לאובייקט במבנה הנדרש
        const tariffs = {};
        for (const row of rows) {
            if (row.season) {
                tariffs[row.season] = { off: row.off_rate, peak: row.peak_rate };
            }
        }
        return tariffs;
    } catch (err) {
        console.error('Error fetching tariffs:', err);
    }
}

async function getUserByUsername(username) {
    const pool = await connectionToSqlDB();

    if (!pool) {
        console.error('Unable to connect to the database.');
        return null;
    }

    try {
        const result = await pool
            .request()
            .input('username', sql.NVarChar(50), username)
            .execute('GetUserByUsername');

        return result.recordset?.[0] || null;
    } catch (err) {
        console.error('Error fetching user by username:', err);
        return null;
    }
}


async function getUserByEmail(email) {
    const pool = await connectionToSqlDB();

    if (!pool) {
        console.error('Unable to connect to the database.');
        return;
    }

    try {
        const result = await pool
            .request()
            .input('email', sql.NVarChar(255), email)
            .execute('GetUserByEmail');

        return result.recordset[0];
    } catch (err) {
        console.error('Error fetching user:', err);
    }
}

async function createUser(username, email, passwordHash, role) {
    const pool = await connectionToSqlDB();

    if (!pool) {
        console.error("Database connection failed");
        return null;
    }

    try {
        const result = await pool
            .request()
            .input("username", sql.NVarChar(50), username)
            .input("email", sql.NVarChar(255), email)
            .input("password_hash", sql.NVarChar(255), passwordHash)
            .input("role", sql.NVarChar(50), role)
            .execute("AddUser");

        return result.recordset[0] || null;

    } catch (err) {
        console.error("Error creating user:", err);
        throw err;
    }
}

async function getBreakerNames() {
    const pool = await connectionToSqlDB();
    if (!pool) {
        console.error('Unable to connect to the database.');
        return;
    }
    try {
        const result = await pool.request().execute('GetBreakersFormatted');
        return result.recordset.map(row => row.displayName);


    } catch (err) {
        console.error('Error fetching breaker names:', err);
    }
}

async function getEnergyData(breakerId, fromDate, toDate) {
    const pool = await connectionToSqlDB();

    const result = await pool
        .request()
        .input("BreakerId", sql.Int, breakerId)
        .input("FromDate", sql.DateTime2, fromDate)
        .input("ToDate", sql.DateTime2, toDate)
        .execute("GetConsumption");

    return result.recordset;
}


export default { connectionToSqlDB, csvHandler, getTariffs, updateAllTariffs, getUserByUsername, getUserByEmail, createUser, getBreakerNames, getEnergyData };