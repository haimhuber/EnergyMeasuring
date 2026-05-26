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
        console.log({ "Connected to OPC UA server": true, timestamp: timestampFunction() });

        session = await client.createSession();
        console.log({ "Session created": true, timestamp: timestampFunction() });

        const dataValue = await session.readVariableValue(nodeIds[0]);
        let raw = dataValue?.value?.value ?? null;

        if (!raw) {
            console.log("No energy values received");
            return null;
        }

        // ── Parse Float32Array / TypedArray → regular number array ──
        let activeEnergy;
        if (raw?.buffer instanceof ArrayBuffer) {
            // Float32Array with 30 values
            activeEnergy = [...raw].map(v => Math.round(v));
        } else if (Array.isArray(raw)) {
            // Already an array — flatten if first element is TypedArray
            if (raw[0]?.buffer instanceof ArrayBuffer) {
                activeEnergy = [...raw[0]].map(v => Math.round(v));
            } else {
                activeEnergy = raw.map(v => parseFloat(v));
            }
        } else if (typeof raw === "string") {
            activeEnergy = raw.split(",").map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        } else {
            activeEnergy = [parseFloat(raw)];
        }

        console.log(`Active Energy values (${activeEnergy.length} breakers):`, activeEnergy, {
            timestamp: timestampFunction()
        });

        await saveDataToSQLServer(activeEnergy, activeEnergy.length);

        return activeEnergy;

    } catch (err) {

        console.error("Error:", err.message || err);
        console.log("OPC UA Server might be down. Returning null.", { timestamp: timestampFunction() });
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

// readOpcActiveEnergyTags();