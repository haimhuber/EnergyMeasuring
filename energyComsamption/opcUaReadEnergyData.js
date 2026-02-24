const { OPCUAClient, AttributeIds, DataType } = require("node-opcua");
const { saveDataToSQLServer } = require('./sqlIntegration');
require('dotenv').config();
const config = require("./nodeIds.json");
const { timestampFunction } = require('./timestamp');
async function readOpcActiveEnergyTags() {
    const client = OPCUAClient.create({ endpoint_must_exist: false });
    const endpointUrl = process.env.OPC_UA_SERVER_URL; 
    const nodeIds = config.nodeIds; 
    let activeEnergy = [];
    try {
        await client.connect(endpointUrl);
    console.log({"Connected to OPC UA server": true, timestamp: timestampFunction()});
        const session = await client.createSession();
    console.log({"Session created": true, timestamp: timestampFunction()});
        // Read a variable node (example nodeId)
         for (let i = 0; i < nodeIds.length; i++)  {
            const dataValue = await session.readVariableValue(nodeIds[i]);
            activeEnergy[i] = dataValue.value.value;
        }
        console.log("Active Energy values:", activeEnergy, { timestamp: timestampFunction() });
        await session.close();
        await client.disconnect();
    } catch (err) {
        console.log("Error:", err);
        console.log("OPC UA Server might be down. Returning null for demand status.", { timestamp: timestampFunction()});
        activeEnergy = null;
    } finally {
        console.log({"Disconnected from OPC UA server": true, timestamp: timestampFunction()}); 
        await client.disconnect();
    }

    // Save active energy values to SQL Server
    if (activeEnergy) {
        await saveDataToSQLServer(activeEnergy, nodeIds.length);
    } 
}
module.exports = { readOpcActiveEnergyTags };
