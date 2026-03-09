import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config({ path: './.env.unified' });

async function connectionToSqlDB() {
    const config = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            useUTC: false
        }
    };

    try {
        let pool = await sql.connect(config);
        console.log('Connected to SQL Server');
        return pool;
    } catch (err) {
        console.error('Database connection failed:', err);
    }
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
        return;
    }
    try {
        const result = await pool
            .request()
            .input('username', sql.NVarChar(50), username)
            .execute('GetUserByUsername');

        return result.recordset[0];
    } catch (err) {
        console.error('Error fetching user:', err);
    }
}

async function createUser(username, passwordHash, role) {
    const pool = await connectionToSqlDB();

    const result = await pool
        .request()
        .input("username", sql.NVarChar(50), username)
        .input("password_hash", sql.NVarChar(255), passwordHash)
        .input("role", sql.NVarChar(50), role)
        .execute("AddUser");

    return result.recordset[0];
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


export default { connectionToSqlDB, csvHandler, getTariffs, getUserByUsername, createUser, getBreakerNames, getEnergyData };