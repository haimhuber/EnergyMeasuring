const fs = require("fs");

const fileName = "energyData.csv";

function ensureHeader() {
  if (!fs.existsSync(fileName) || fs.statSync(fileName).size === 0) {
    fs.writeFileSync(fileName, "BreakerId,ActiveEnergy,timestamp\n");
  }
}

const storeData = async function (values) {
  ensureHeader();

  const now = new Date().toISOString();

  const rows = values
    .map((value, index) => `${index + 1},${value},${now}`)
    .join("\n") + "\n";

  fs.appendFileSync(fileName, rows);
};

module.exports = { storeData };