const readEnergyData = require('./opcUaReadEnergyData');
async function main() {
    try {   
        const energyData = await readEnergyData.readOpcActiveEnergyTags();
        console.log("Energy data read and saved successfully:", energyData);
    } catch (err) {
        console.log("Error in main function:", err);
    }
}


setInterval(main, 60 * 60 * 1000); // Run every hour