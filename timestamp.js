// Small timestamp helper exported as a standalone module to avoid circular requires
const timestampFunction = function() {
  return `${new Date().toDateString()} - ${new Date().toLocaleTimeString()}`;
};

module.exports = { timestampFunction };
