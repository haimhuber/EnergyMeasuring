const { DateTime } = require('luxon');
// Small timestamp helper exported as a standalone module to avoid circular requires
const timestampFunction = function() {
  return `${new Date().toDateString()} - ${new Date().toLocaleTimeString()}`;
};



const localTime = function() {
  const isoIsrael = DateTime.now()
  .setZone('Asia/Jerusalem')
  .toISO({ includeOffset: false });
  return isoIsrael;
};

module.exports = { timestampFunction, localTime };
