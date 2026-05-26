/**
 * test_opc_to_postgres.js
 * טסט: קריאה מ-OPC UA → כתיבה ל-Supabase בלבד
 * הרצה: node test_opc_to_postgres.js
 */

const { OPCUAClient } = require("node-opcua");
const { Pool } = require("pg");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
  path: path.join(__dirname, "../EnergyDashboard/.env.unified"),
});

// ── PostgreSQL connection ─────────────────────────────────
const pgPool = new Pool({
  host:     process.env.PG_HOST,
  port:     Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || "postgres",
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

// ── OPC UA config ─────────────────────────────────────────
const nodeIds = [
  "ns=4;s=|var|AC500 PM56xx-2ETH.Application.OPC_GVL.rEnergy"
];

const endpointUrl = process.env.OPC_UA_SERVER_URL;

// ── Main test ─────────────────────────────────────────────
async function testOpcToPostgres() {
  console.log("🚀 Starting OPC → Supabase test...");
  console.log(`📡 OPC URL: ${endpointUrl}`);
  console.log(`🗄️  PG Host: ${process.env.PG_HOST}`);

  // 1. Test PostgreSQL connection
  console.log("\n[1] Testing PostgreSQL connection...");
  try {
    const res = await pgPool.query("SELECT NOW() as now, COUNT(*) as total FROM energydata");
    console.log("✅ PostgreSQL connected!");
    console.log(`   Server time: ${res.rows[0].now}`);
    console.log(`   Rows in energydata: ${res.rows[0].total}`);
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
    process.exit(1);
  }

  // 2. Read from OPC UA
  console.log("\n[2] Connecting to OPC UA...");
  const client = OPCUAClient.create({ endpointMustExist: false });
  let session = null;
  let activeEnergy = null;

  try {
    await client.connect(endpointUrl);
    console.log("✅ OPC UA connected!");

    session = await client.createSession();
    console.log("✅ Session created!");

    const dataValue = await session.readVariableValue(nodeIds[0]);
    let raw = dataValue?.value?.value ?? null;

    // Debug: show exact type and value
    console.log(`   RAW type: ${typeof raw}`);
    console.log(`   RAW constructor: ${raw?.constructor?.name}`);
    console.log(`   RAW value: ${JSON.stringify(raw)}`);
    console.log(`   dataValue.value.dataType: ${dataValue?.value?.dataType}`);

    if (raw === null) {
      console.warn("⚠️  No data received from OPC UA");
    } else {
      // Float32Array / TypedArray → spread to regular array
      if (raw?.buffer instanceof ArrayBuffer) {
        activeEnergy = [...raw].map(v => Math.round(v));
      } else if (typeof raw === "string") {
        activeEnergy = raw.split(",").map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
      } else if (Array.isArray(raw)) {
        activeEnergy = raw.map(v => parseFloat(v));
      } else {
        activeEnergy = [parseFloat(raw)];
      }
      console.log(`✅ OPC data received: ${activeEnergy.length} values`);
      activeEnergy.forEach((v, i) => console.log(`   Breaker ${i + 1}: ${v}`));
    }

  } catch (err) {
    console.error("❌ OPC UA error:", err.message);
    console.log("   Continuing with mock data for PostgreSQL test...");
    // mock data for testing postgres write even if OPC is down
    activeEnergy = [999999, 11111, 22222];
  } finally {
    try { if (session) await session.close(); } catch {}
    try { await client.disconnect(); } catch {}
    console.log("✅ OPC UA disconnected");
  }

  // 3. Write to PostgreSQL
  if (activeEnergy && activeEnergy.length > 0) {
    console.log("\n[3] Writing to Supabase...");
    const ts = new Date().toISOString();
    let written = 0;
    let errors = 0;

    for (let i = 0; i < activeEnergy.length; i++) {
      const energy = activeEnergy[i];
      if (energy === null || energy === undefined) continue;

      try {
        await pgPool.query(
          `INSERT INTO energydata (breakerid, activeenergy, ts) VALUES ($1, $2, $3)`,
          [i + 1, energy, ts]
        );
        written++;
        console.log(`   ✅ Breaker ${i + 1}: ${energy} → written`);
      } catch (err) {
        errors++;
        console.error(`   ❌ Breaker ${i + 1}: ${err.message}`);
      }
    }

    console.log(`\n📊 Result: ${written} written, ${errors} errors`);

    // 4. Verify
    console.log("\n[4] Verifying last inserted rows...");
    try {
      const verify = await pgPool.query(
        `SELECT breakerid, activeenergy, ts 
         FROM energydata 
         ORDER BY ts DESC 
         LIMIT ${activeEnergy.length}`
      );
      console.log("✅ Last rows in Supabase:");
      verify.rows.forEach(r =>
        console.log(`   Breaker ${r.breakerid}: ${r.activeenergy} @ ${r.ts}`)
      );
    } catch (err) {
      console.error("❌ Verify failed:", err.message);
    }
  }

  await pgPool.end();
  console.log("\n✅ Test complete!");
}

testOpcToPostgres().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});