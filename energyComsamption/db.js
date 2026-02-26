const sql = require('mssql');
require('dotenv').config();


async function connectionToSqlDB() {
    const config = {
        server: process.env.SERVER,
        user: process.env.USER,
        password: process.env.PASSWORD,
        database: process.env.DATABASE,
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
    } else {
        try {
            const result = await pool.request().query('SELECT * FROM EnergyData');
            const data = result.recordset;
            return data;
            // Here you can add code to convert 'data' to CSV format and save it to a file
        } catch (err) {
            console.error('Error executing query:', err);
        }  
}
}

module.exports = { connectionToSqlDB, csvHandler };