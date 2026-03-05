const fs = require("fs");
const path = require("path");
const { localTime } = require("./timestamp");
const csvSql = require("./db");

// שמירת הקובץ בתיקייה קבועה C:\Energy
const fileName = "C:\\Energy\\energyData.csv";

/**
 * מביא את כל הנתונים מ-SQL לשחזור הקובץ
 * מצפה לקבל מערך רשומות: [{BreakerId, ActiveEnergy, timestamp?}, ...]
 */
async function fetchDbData() {
  try {
    const data = await csvSql.csvHandler(); // חייב להחזיר מערך רשומות
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

/**
 * Normalize record keys + output values
 */
function normalizeRecord(record) {
  if (!record || typeof record !== "object") return null;

  const breakerId = record.BreakerId ?? record.breakerId ?? "";
  const activeEnergy = record.ActiveEnergy ?? record.activeEnergy ?? "";
  const ts = record.timestamp
    ? new Date(record.timestamp).toISOString()
    : localTime();

  // ✅ אל תכתוב שורות שאין בהן מידע אמיתי
  if (breakerId === "" || activeEnergy === "") return null;

  return { breakerId, activeEnergy, ts };
}

function toCsvLine(record) {
  const n = normalizeRecord(record);
  if (!n) return null;
  return `${n.breakerId},${n.activeEnergy},${n.ts}`;
}

/**
 * Creating CSV file from SQL data if it doesn't exist or is empty.
 * This ensures we have a base file to append to later.
 */
async function ensureCsvExists() {
  const missingOrEmpty =
    !fs.existsSync(fileName) || fs.statSync(fileName).size === 0;

  if (!missingOrEmpty) return;

  writeHeader();

  const dbRows = await fetchDbData();
  if (!dbRows.length) return;

  const lines = dbRows.map(toCsvLine).filter(Boolean);
  if (lines.length === 0) return;

  const body = lines.join("\n") + "\n";

  ensureFileEndsWithNewline(fileName);
  fs.appendFileSync(fileName, body, "utf8");
}

/**
 * Append new rows to CSV
 * values expected: [{BreakerId, ActiveEnergy, timestamp?}, ...]
 */
const storeData = async function (values = []) {
  await ensureCsvExists();

  if (!Array.isArray(values) || values.length === 0) return;

  const lines = values.map(toCsvLine).filter(Boolean);
  if (lines.length === 0) return;

  const rows = lines.join("\n") + "\n";

  ensureFileEndsWithNewline(fileName);
  fs.appendFileSync(fileName, rows, "utf8");
};

module.exports = { storeData, ensureCsvExists };

/**
 * Helper: make sure file ends with newline. Creates file if missing.
 */
function ensureFileEndsWithNewline(fname) {
  let fd;
  try {
    if (!fs.existsSync(fname)) return;
    const stat = fs.statSync(fname);
    if (stat.size === 0) return;

    fd = fs.openSync(fname, "r");
    const buf = Buffer.alloc(1);

    // read last byte
    fs.readSync(fd, buf, 0, 1, stat.size - 1);

    const last = String.fromCharCode(buf[0]);
    if (last !== "\n" && last !== "\r") {
      fs.appendFileSync(fname, "\n", "utf8");
    }
  } catch (e) {
    // non-fatal
  } finally {
    try {
      if (fd) fs.closeSync(fd);
    } catch (_) { }
  }
}