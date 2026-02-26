const fs = require("fs");
const path = require("path");
const { localTime } = require("./timestamp");
const csvSql = require("./db");

// מומלץ לשמור את הקובץ ליד הקוד ולא תלוי ב-CWD
const fileName = path.join(__dirname, "energyData.csv");

/**
 * מביא את כל הנתונים מ-SQL לשחזור הקובץ
 * מצפה לקבל מערך רשומות: [{BreakerId, ActiveEnergy, timestamp?}, ...]
 */
async function fetchDbData() {
  try {
    const data = await csvSql.csvHandler(); // צריך שיחזיר recordset (array)
    if (!data) return [];
    if (!Array.isArray(data)) {
      console.error("csvHandler() must return an array of records. Got:", typeof data);
      return [];
    }
    return data;
  } catch (err) {
    console.error("Error fetching DB data:", err);
    return [];
  }
}

function writeHeader() {
  fs.writeFileSync(fileName, "BreakerId,ActiveEnergy,timestamp\n", "utf8");
}

function toCsvLine(record) {
  const breakerId = record?.BreakerId ?? record?.breakerId ?? "";
  const energy = record?.ActiveEnergy ?? record?.activeEnergy ?? "";
  const ts = record?.timestamp ? new Date(record.timestamp).toISOString() : localTime();
  return `${breakerId},${energy},${ts}`;
}

/**
  Creating CSV file from SQL data if it doesn't exist or is empty. This ensures we have a base file to append to later.
 */
async function ensureCsvExists() {
  const missingOrEmpty =
    !fs.existsSync(fileName) || fs.statSync(fileName).size === 0;

  if (!missingOrEmpty) return;

  writeHeader();

  const dbRows = await fetchDbData();
  if (!dbRows.length) return;

  const body = dbRows.map(toCsvLine).join("\n") + "\n";
  fs.appendFileSync(fileName, body, "utf8");
}

const storeData = async function (values = []) {
  await ensureCsvExists();

  if (!Array.isArray(values) || values.length === 0) return;

  const rows = values
    .map((v) =>
      `${v.BreakerId},${v.ActiveEnergy},${v.timestamp ? new Date(v.timestamp).toISOString() : localTime()}`
    )
    .join("\n") + "\n";

  fs.appendFileSync(fileName, rows, "utf8");
};


storeData();

module.exports = { storeData, ensureCsvExists };