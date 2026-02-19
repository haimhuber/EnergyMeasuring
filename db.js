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

module.exports = { connectionToSqlDB };