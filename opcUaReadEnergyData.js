const { OPCUAClient, AttributeIds, DataType } = require("node-opcua");
const { saveDataToSQLServer } = require('./sqlIntegration');
require('dotenv').config();
const { timestampFunction } = require('./timestamp');
async function readOpcActiveEnergyTags() {
    const client = OPCUAClient.create({ endpoint_must_exist: false });
    const endpointUrl = process.env.OPC_UA_SERVER_URL; 
    const nodeIds = ["ns=2;s=stCB[1].rActiveEnergy", "ns=2;s=stCB[4].rActiveEnergy"];
    let activeEnergy = [];
    try {
        await client.connect(endpointUrl);
    console.log({"Connected to OPC UA server": true, timestamp: timestampFunction()});
        const session = await client.createSession();
    console.log({"Session created": true, timestamp: timestampFunction()});
        // Read a variable node (example nodeId)
        for (const nodeId of nodeIds) {
            const dataValue = await session.readVariableValue(nodeId);
            activeEnergy[nodeId] = dataValue.value.value;
        }
        console.log("Active Energy values:", activeEnergy, { timestamp: timestampFunction() });
        await session.close();
        await client.disconnect();
    } catch (err) {
        console.log("Error:", err);
        console.log("OPC UA Server might be down. Returning null for demand status.", { timestamp: timestampFunction()});
        activeEnergy = null;
    }

    // Save active energy values to SQL Server
    if (activeEnergy) {
        await saveDataToSQLServer(activeEnergy);
    } 
}
module.exports = { readOpcActiveEnergyTags };
