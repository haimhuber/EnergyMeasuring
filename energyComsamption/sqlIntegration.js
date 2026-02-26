const sql = require('mssql');
require('dotenv').config();
const { timestampFunction } = require('./timestamp');
const { storeData } = require('./energyDatacsv');
const { LogLevel } = require('node-opcua-debug');
const sqlTable = process.env.TABLE; 

async function saveDataToSQLServer(data, numberOfNodes) {

    try {
        const pool = await sql.connect({    
            server: process.env.SERVER,
            user: process.env.USER,
            password: process.env.PASSWORD,
            database: process.env.DATABASE,
            options: {
                encrypt: false,
                trustServerCertificate: true    
                }
               });
            if (pool.connected) {
                console.log("Connected to SQL Server.", { timestamp: timestampFunction() });
                for (let i = 0; i < numberOfNodes; i++) {
                    const query = `
                    INSERT INTO ${sqlTable} (breakerId, activeEnergy)
                    VALUES (@breakerId, @activeEnergy)
                   `;
                    const request = pool.request();
                    request.input('breakerId', sql.Int, (i + 1)); // Assuming breakerId starts from 1
                    request.input('activeEnergy', sql.Float, data[i]);
                    await request.query(query);
                }
                await storeData(
                    data.map((energy, idx) => ({
                        BreakerId: idx + 1,
                        ActiveEnergy: energy
                    }))
                    );
                
                console.log("End of SQL Server operations.", { timestamp: timestampFunction() });
               }
           } catch (err) {
               console.log("Error saving active energy values to SQL Server:", err);
           }
       };

module.exports = { saveDataToSQLServer };       
       
       
