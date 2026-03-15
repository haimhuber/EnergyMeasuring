// const fs = require("fs");
// const path = require("path");

// const inputFile = path.join(__dirname, "energyData.csv");

// console.log("__dirname:", __dirname);
// console.log("inputFile:", inputFile);
// console.log("exists:", fs.existsSync(inputFile));

// if (!fs.existsSync(inputFile)) {
//     console.error("File not found!");
//     process.exit(1);
// }


// const breakerMap = {
//     1: 22,
//     2: 23,
//     3: 26,
//     4: 1,
//     5: 4,
//     6: 29,
//     7: 27
// };

// const fileContent = fs.readFileSync(inputFile, "utf8");
// const lines = fileContent.split(/\r?\n/);

// const fixedLines = lines.map((line, index) => {

//     if (!line.trim()) return line;

//     // header
//     if (index === 0 && line.startsWith("BreakerId")) {
//         return line;
//     }

//     const parts = line.split(",");

//     const breakerId = Number(parts[0]);

//     if (breakerMap[breakerId]) {
//         parts[0] = breakerMap[breakerId];
//     }

//     return parts.join(",");
// });

// fs.writeFileSync(inputFile, fixedLines.join("\n"), "utf8");

// console.log("CSV updated successfully");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const sql = require("mssql");

const inputFile = path.join(__dirname, "EnergyData.csv");

const breakerMap = {
    1: 22,
    2: 23,
    3: 26,
    4: 1,
    5: 4,
    6: 29,
    7: 27
};

const dbConfig = {
    user: "abb",
    password: "1234",
    server: "10.29.176.136\\SQLEXPRESS",
    database: "EnergyManagment",
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

function normalizeTimestamp(ts) {
    if (!ts) return null;

    let value = String(ts).trim();

    // אם אין Z בסוף – נוסיף
    if (!value.endsWith("Z")) {
        value += "Z";
    }

    // תיקון מקרים של יותר מ-3 ספרות במילישניות
    // לדוגמה: 2026-03-02T09:00:01.6081Z -> 2026-03-02T09:00:01.608Z
    value = value.replace(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z$/,
        (_, base, fraction) => {
            if (!fraction) return `${base}.000Z`;
            return `${base}.${fraction.slice(1, 4).padEnd(3, "0")}Z`;
        }
    );

    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

async function importCsv() {
    const pool = await sql.connect(dbConfig);

    const rows = [];
    let lineNumber = 1;
    let skipped = 0;

    fs.createReadStream(inputFile)
        .pipe(csv())
        .on("data", (row) => {
            lineNumber++;

            let breakerId = Number(row.BreakerId);
            const energy = Number(row.ActiveEnergy);
            const timestamp = normalizeTimestamp(row.timestamp);

            if (breakerMap[breakerId]) {
                breakerId = breakerMap[breakerId];
            }

            if (!breakerId || Number.isNaN(energy) || !timestamp) {
                console.log(`Skipped bad row ${lineNumber}:`, row);
                skipped++;
                return;
            }

            rows.push({
                breakerId,
                energy,
                timestamp
            });
        })
        .on("end", async () => {
            try {
                console.log("Valid rows:", rows.length);
                console.log("Skipped rows:", skipped);

                for (const r of rows) {
                    await pool.request()
                        .input("breakerId", sql.Int, r.breakerId)
                        .input("energy", sql.BigInt, r.energy)
                        .input("timestamp", sql.DateTime2, r.timestamp)
                        .query(`
                            INSERT INTO EnergyData (BreakerId, ActiveEnergy, timestamp)
                            VALUES (@breakerId, @energy, @timestamp)
                        `);
                }

                console.log("Import finished successfully");
            } catch (err) {
                console.error("Import failed:", err);
            } finally {
                await pool.close();
                process.exit();
            }
        })
        .on("error", async (err) => {
            console.error("CSV read error:", err);
            await pool.close();
            process.exit(1);
        });
}

importCsv();