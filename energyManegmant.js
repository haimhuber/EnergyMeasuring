const readEnergyData = require('./opcUaReadEnergyData');
const { DateTime } = require('luxon');
async function main() {
    try {   
        const energyData = await readEnergyData.readOpcActiveEnergyTags();
        console.log("Energy data read and saved successfully:", energyData);
    } catch (err) {
        console.log("Error in main function:", err);
    }
}

function scheduleNextRun(callback) {
  const now = DateTime.now().setZone('Asia/Jerusalem');
  const nextHour = now.plus({ hours: 1 }).startOf('hour');
  const delay = nextHour.toMillis() - now.toMillis();

  setTimeout(() => {
    callback();
    scheduleNextRun(callback); // מתזמן מחדש כל פעם
  }, delay);
}

// שימוש
scheduleNextRun(() => {
  const israelNow = DateTime.now().setZone('Asia/Jerusalem');
  console.log("Running at:", israelNow.toISO());
  main();
});