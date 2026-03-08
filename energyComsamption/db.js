import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config({ path: './.env.unified' });

async function connectionToSqlDB() {
    const config = {
        server: 'localhost\\ABB_2019',
        user: 'abb',
        password: '1234',
        database: 'EnergyManagment',
        options: {
            encrypt: false,
            trustServerCertificate: true
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

export default { connectionToSqlDB, csvHandler, getTariffs, getUserByUsername, createUser };