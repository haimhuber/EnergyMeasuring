const readEnergyData = require('./opcUaReadEnergyData');
const { DateTime } = require('luxon');
const { scheduleNextRun } = require('./scheduleCycle');

// scheduleNextRun(readEnergyData.readOpcActiveEnergyTags);
readEnergyData.readOpcActiveEnergyTags();




