const { DateTime } = require('luxon');
// Function to schedule the next run at the start of the next hour
function scheduleNextRun(callback) {
  const now = DateTime.now().setZone('Asia/Jerusalem');
  const nextHour = now.plus({ hours: 1 }).startOf('hour');
  const delay = nextHour.toMillis() - now.toMillis();

  setTimeout(() => {
    callback();
    scheduleNextRun(callback);
  }, delay);
};

module.exports = { scheduleNextRun };