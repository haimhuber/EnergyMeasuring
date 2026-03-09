const sql = require("mssql");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
  path: path.join(__dirname, "../EnergyDashboard/.env.unified"),
});

const { timestampFunction } = require("./timestamp");
const { storeData } = require("./energyDatacsv");

const sqlTable = process.env.DB_TABLE;

async function saveDataToSQLServer(data, numberOfNodes) {
  let pool;

  try {
    const dbConfig = {
      server: process.env.DB_SERVER,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    };

    console.log("SQL ENV CHECK:", {
      DB_SERVER: dbConfig.server,
      DB_USER: dbConfig.user,
      DB_NAME: dbConfig.database,
      TABLE: sqlTable,
      DB_PASSWORD_LOADED: !!dbConfig.password,
    });

    if (!dbConfig.server) throw new Error("Missing DB_SERVER in .env.unified");
    if (!dbConfig.user) throw new Error("Missing DB_USER in .env.unified");
    if (!dbConfig.password) throw new Error("Missing DB_PASSWORD in .env.unified");
    if (!dbConfig.database) throw new Error("Missing DB_NAME in .env.unified");
    if (!sqlTable) throw new Error("Missing TABLE in .env.unified");

    if (!Array.isArray(data)) {
      throw new Error("Data must be an array");
    }

    pool = await sql.connect(dbConfig);

    console.log("Connected to SQL Server.", { timestamp: timestampFunction() });

    for (let i = 0; i < numberOfNodes; i++) {
      const activeEnergy = data[i];

      if (activeEnergy === undefined || activeEnergy === null) {
        console.warn(`Skipping node ${i + 1}: activeEnergy is missing`);
        continue;
      }

      const query = `
        INSERT INTO ${sqlTable} (breakerId, activeEnergy)
        VALUES (@breakerId, @activeEnergy)
      `;

      const request = pool.request();
      request.input("breakerId", sql.Int, i + 1);
      request.input("activeEnergy", sql.Float, activeEnergy);

      await request.query(query);
    }

    await storeData(
      data.map((energy, idx) => ({
        BreakerId: idx + 1,
        ActiveEnergy: energy,
      }))
    );

    console.log("End of SQL Server operations.", {
      timestamp: timestampFunction(),
    });
  } catch (err) {
    console.error("Error saving active energy values to SQL Server:", err.message || err);
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