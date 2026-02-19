const sql = require('mssql');
require('dotenv').config();
const { timestampFunction } = require('./timestamp');
const nodeIds = ["ns=2;s=stCB[1].rActiveEnergy", "ns=2;s=stCB[4].rActiveEnergy"];
const sqlTable = process.env.TABLE; 

async function saveDataToSQLServer(data) {
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
                for (const nodeId of nodeIds) {
                    const query = `
                    INSERT INTO ${sqlTable} (breakerId, activeEnergy)
                    VALUES (@breakerId, @activeEnergy)
                   `;
                    const request = pool.request();
                    request.input('breakerId', sql.Int, (nodeIds.indexOf(nodeId) + 1)); // Assuming breakerId starts from 1
                    request.input('activeEnergy', sql.Float, data[nodeId]);
                    await request.query(query);
                    console.log(`Active energy value for ${nodeId} saved to SQL Server.`, { timestamp: timestampFunction() });
                }
                console.log("End of SQL Server operations.", { timestamp: timestampFunction() });
               }
           } catch (err) {
               console.log("Error saving active energy values to SQL Server:", err);
           }
       };

module.exports = { saveDataToSQLServer };       
       
       
