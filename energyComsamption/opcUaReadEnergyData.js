const { OPCUAClient } = require("node-opcua");
const { saveDataToSQLServer } = require("./sqlIntegration");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
    path: path.join(__dirname, "../EnergyDashboard/.env.unified")
});

const { timestampFunction } = require("./timestamp");

const nodeIds = [
    "ns=4;s=|var|AC500 PM56xx-2ETH.Application.OPC_GVL.rEnergy"
];

async function readOpcActiveEnergyTags() {

    const client = OPCUAClient.create({
        endpointMustExist: false
    });

    const endpointUrl = process.env.OPC_UA_SERVER_URL;

    let session = null;

    if (!endpointUrl) {
        console.error("Missing OPC_UA_SERVER_URL in .env.unified");
        return null;
    }

    try {

        await client.connect(endpointUrl);
        console.log({
            "Connected to OPC UA server": true,
            timestamp: timestampFunction()
        });

        session = await client.createSession();
        console.log({
            "Session created": true,
            timestamp: timestampFunction()
        });

        const dataValue = await session.readVariableValue(nodeIds[0]);

        let activeEnergy = dataValue?.value?.value ?? null;

        if (!activeEnergy) {
            console.log("No energy values received");
            return null;
        }

        // Transform the activeEnergy value into an array if it's not already
        if (!Array.isArray(activeEnergy)) {
            activeEnergy = [activeEnergy];
        }
        activeEnergy = Array.from(activeEnergy);

        console.log("Active Energy values:", activeEnergy, {
            timestamp: timestampFunction()
        });

        await saveDataToSQLServer(activeEnergy, activeEnergy.length);

        return activeEnergy;

    } catch (err) {

        console.error("Error:", err.message || err);

        console.log(
            "OPC UA Server might be down. Returning null for demand status.",
            { timestamp: timestampFunction() }
        );

        return null;

    } finally {

        try {
            if (session) {
                await session.close();
                console.log({
                    "Session closed": true,
                    timestamp: timestampFunction()
                });
            }
        } catch (closeErr) {
            console.error("Error closing session:", closeErr.message || closeErr);
        }

        try {
            await client.disconnect();
            console.log({
                "Disconnected from OPC UA server": true,
                timestamp: timestampFunction()
            });
        } catch (disconnectErr) {
            console.error("Error disconnecting client:", disconnectErr.message || disconnectErr);
        }
    }
}

module.exports = { readOpcActiveEnergyTags };


// readOpcActiveEnergyTags();
