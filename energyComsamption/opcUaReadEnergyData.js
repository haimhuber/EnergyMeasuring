const { OPCUAClient } = require("node-opcua");
const { saveDataToSQLServer } = require("./sqlIntegration");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
  path: path.join(__dirname, "../EnergyDashboard/.env.unified")
});
console.log("OPC URL:", process.env.OPC_UA_SERVER_URL);
const config = require("./nodeIds.json");
const { timestampFunction } = require("./timestamp");

async function readOpcActiveEnergyTags() {
    const client = OPCUAClient.create({
        endpointMustExist: false
    });

    const endpointUrl = process.env.OPC_UA_SERVER_URL;
    const nodeIds = config.nodeIds;
    let activeEnergy = [];
    let session = null;

    console.log("Loaded OPC_UA_SERVER_URL:", endpointUrl);

    if (!endpointUrl) {
        console.error("Missing OPC_UA_SERVER_URL in .env.unified");
        return null;
    }

    try {
        await client.connect(endpointUrl);
        console.log({ "Connected to OPC UA server": true, timestamp: timestampFunction() });

        session = await client.createSession();
        console.log({ "Session created": true, timestamp: timestampFunction() });

        for (let i = 0; i < nodeIds.length; i++) {
            const dataValue = await session.readVariableValue(nodeIds[i]);
            activeEnergy[i] = dataValue?.value?.value ?? null;
        }

        console.log("Active Energy values:", activeEnergy, { timestamp: timestampFunction() });

        if (activeEnergy) {
            await saveDataToSQLServer(activeEnergy, nodeIds.length);
        }

        return activeEnergy;
    } catch (err) {
        console.error("Error:", err.message || err);
        console.log("OPC UA Server might be down. Returning null for demand status.", {
            timestamp: timestampFunction()
        });
        return null;
    } finally {
        try {
            if (session) {
                await session.close();
                console.log({ "Session closed": true, timestamp: timestampFunction() });
            }
        } catch (closeErr) {
            console.error("Error closing session:", closeErr.message || closeErr);
        }

        try {
            await client.disconnect();
            console.log({ "Disconnected from OPC UA server": true, timestamp: timestampFunction() });
        } catch (disconnectErr) {
            console.error("Error disconnecting client:", disconnectErr.message || disconnectErr);
        }
    }
}

module.exports = { readOpcActiveEnergyTags };