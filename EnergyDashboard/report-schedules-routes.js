// =========================
// 14) Report Schedules API
// =========================

// Helper: parse breaker_ids and recipients per driver
function parseScheduleRow(row, driver) {
  if (driver === "postgres") {
    return {
      id:              row.id,
      name:            row.name,
      breaker_ids:     Array.isArray(row.breaker_ids) ? row.breaker_ids : [],
      frequency:       row.frequency,
      send_time:       row.send_time,
      send_day_week:   row.send_day_week,
      send_day_month:  row.send_day_month,
      recipients:      Array.isArray(row.recipients) ? row.recipients : [],
      active:          row.active,
      created_at:      row.created_at,
      last_sent:       row.last_sent,
    };
  }
  // mssql — arrays stored as JSON strings
  return {
    id:              row.id,
    name:            row.name,
    breaker_ids:     JSON.parse(row.breaker_ids || "[]"),
    frequency:       row.frequency,
    send_time:       row.send_time,
    send_day_week:   row.send_day_week,
    send_day_month:  row.send_day_month,
    recipients:      JSON.parse(row.recipients || "[]"),
    active:          row.active === true || row.active === 1,
    created_at:      row.created_at,
    last_sent:       row.last_sent,
  };
}

export function registerReportScheduleRoutes(app, db, authRequired, DB_DRIVER) {

  // GET all schedules
  app.get("/api/report-schedules", authRequired, async (req, res) => {
    try {
      let rows;
      if (DB_DRIVER === "postgres") {
        const pool = await db.connectionToSqlDB();
        const result = await pool.query("SELECT * FROM report_schedule ORDER BY id");
        rows = result.rows;
      } else {
        const pool = await db.connectionToSqlDB();
        const result = await pool.request().query("SELECT * FROM report_schedule ORDER BY id");
        rows = result.recordset;
      }
      res.json(rows.map(r => parseScheduleRow(r, DB_DRIVER)));
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // POST create schedule
  app.post("/api/report-schedules", authRequired, async (req, res) => {
    try {
      const { name, breaker_ids, frequency, send_time, send_day_week, send_day_month, recipients, active } = req.body;
      if (!name || !breaker_ids?.length || !frequency || !send_time || !recipients?.length)
        return res.status(400).json({ detail: "Missing required fields" });
      if (!["daily","weekly","monthly"].includes(frequency))
        return res.status(400).json({ detail: "Invalid frequency" });

      let row;
      if (DB_DRIVER === "postgres") {
        const pool = await db.connectionToSqlDB();
        const result = await pool.query(
          `INSERT INTO report_schedule (name, breaker_ids, frequency, send_time, send_day_week, send_day_month, recipients, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [name, breaker_ids, frequency, send_time, send_day_week ?? 0, send_day_month ?? 1, recipients, active !== false]
        );
        row = result.rows[0];
      } else {
        const { default: sql } = await import("mssql");
        const pool = await db.connectionToSqlDB();
        const result = await pool.request()
          .input("name",           sql.NVarChar(100), name)
          .input("breaker_ids",    sql.NVarChar,      JSON.stringify(breaker_ids))
          .input("frequency",      sql.NVarChar(10),  frequency)
          .input("send_time",      sql.NVarChar(5),   send_time)
          .input("send_day_week",  sql.Int,           send_day_week ?? 0)
          .input("send_day_month", sql.Int,           send_day_month ?? 1)
          .input("recipients",     sql.NVarChar,      JSON.stringify(recipients))
          .input("active",         sql.Bit,           active !== false ? 1 : 0)
          .query(`INSERT INTO report_schedule (name,breaker_ids,frequency,send_time,send_day_week,send_day_month,recipients,active)
                  OUTPUT INSERTED.*
                  VALUES (@name,@breaker_ids,@frequency,@send_time,@send_day_week,@send_day_month,@recipients,@active)`);
        row = result.recordset[0];
      }
      res.status(201).json(parseScheduleRow(row, DB_DRIVER));
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // PUT update schedule
  app.put("/api/report-schedules/:id", authRequired, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, breaker_ids, frequency, send_time, send_day_week, send_day_month, recipients, active } = req.body;
      if (!name || !breaker_ids?.length || !frequency || !send_time || !recipients?.length)
        return res.status(400).json({ detail: "Missing required fields" });

      let row;
      if (DB_DRIVER === "postgres") {
        const pool = await db.connectionToSqlDB();
        const result = await pool.query(
          `UPDATE report_schedule SET name=$1, breaker_ids=$2, frequency=$3, send_time=$4,
           send_day_week=$5, send_day_month=$6, recipients=$7, active=$8
           WHERE id=$9 RETURNING *`,
          [name, breaker_ids, frequency, send_time, send_day_week ?? 0, send_day_month ?? 1, recipients, active !== false, id]
        );
        if (!result.rows.length) return res.status(404).json({ detail: "Schedule not found" });
        row = result.rows[0];
      } else {
        const { default: sql } = await import("mssql");
        const pool = await db.connectionToSqlDB();
        const result = await pool.request()
          .input("id",             sql.Int,           id)
          .input("name",           sql.NVarChar(100), name)
          .input("breaker_ids",    sql.NVarChar,      JSON.stringify(breaker_ids))
          .input("frequency",      sql.NVarChar(10),  frequency)
          .input("send_time",      sql.NVarChar(5),   send_time)
          .input("send_day_week",  sql.Int,           send_day_week ?? 0)
          .input("send_day_month", sql.Int,           send_day_month ?? 1)
          .input("recipients",     sql.NVarChar,      JSON.stringify(recipients))
          .input("active",         sql.Bit,           active !== false ? 1 : 0)
          .query(`UPDATE report_schedule SET name=@name, breaker_ids=@breaker_ids, frequency=@frequency,
                  send_time=@send_time, send_day_week=@send_day_week, send_day_month=@send_day_month,
                  recipients=@recipients, active=@active
                  OUTPUT INSERTED.* WHERE id=@id`);
        if (!result.recordset.length) return res.status(404).json({ detail: "Schedule not found" });
        row = result.recordset[0];
      }
      res.json(parseScheduleRow(row, DB_DRIVER));
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // PATCH toggle active
  app.patch("/api/report-schedules/:id/toggle", authRequired, async (req, res) => {
    try {
      const id = Number(req.params.id);
      let row;
      if (DB_DRIVER === "postgres") {
        const pool = await db.connectionToSqlDB();
        const result = await pool.query(
          "UPDATE report_schedule SET active = NOT active WHERE id=$1 RETURNING *", [id]
        );
        if (!result.rows.length) return res.status(404).json({ detail: "Not found" });
        row = result.rows[0];
      } else {
        const { default: sql } = await import("mssql");
        const pool = await db.connectionToSqlDB();
        const result = await pool.request()
          .input("id", sql.Int, id)
          .query("UPDATE report_schedule SET active = 1 - active OUTPUT INSERTED.* WHERE id=@id");
        if (!result.recordset.length) return res.status(404).json({ detail: "Not found" });
        row = result.recordset[0];
      }
      res.json(parseScheduleRow(row, DB_DRIVER));
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // DELETE schedule
  app.delete("/api/report-schedules/:id", authRequired, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (DB_DRIVER === "postgres") {
        const pool = await db.connectionToSqlDB();
        await pool.query("DELETE FROM report_schedule WHERE id=$1", [id]);
      } else {
        const { default: sql } = await import("mssql");
        const pool = await db.connectionToSqlDB();
        await pool.request().input("id", sql.Int, id).query("DELETE FROM report_schedule WHERE id=@id");
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // POST preview — generate HTML without sending
  app.post("/api/report-schedules/preview", authRequired, async (req, res) => {
    try {
      const { breaker_ids, frequency, name } = req.body;
      if (!breaker_ids?.length) return res.status(400).json({ detail: "No breakers selected" });

      const { buildReportHtml } = await import("../energyComsamption/emailReport.js");
      const html = await buildReportHtml({ breaker_ids, frequency: frequency || "daily", name: name || "Preview" });
      res.json({ html });
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // POST send now (manual trigger)
  app.post("/api/report-schedules/:id/send-now", authRequired, async (req, res) => {
    try {
      const id = Number(req.params.id);
      let row;
      if (DB_DRIVER === "postgres") {
        const pool = await db.connectionToSqlDB();
        const result = await pool.query("SELECT * FROM report_schedule WHERE id=$1", [id]);
        if (!result.rows.length) return res.status(404).json({ detail: "Not found" });
        row = parseScheduleRow(result.rows[0], DB_DRIVER);
      } else {
        const { default: sql } = await import("mssql");
        const pool = await db.connectionToSqlDB();
        const result = await pool.request().input("id", sql.Int, id).query("SELECT * FROM report_schedule WHERE id=@id");
        if (!result.recordset.length) return res.status(404).json({ detail: "Not found" });
        row = parseScheduleRow(result.recordset[0], DB_DRIVER);
      }

      // Import and run
      const { sendScheduledReport } = await import("../energyComsamption/emailReport.js");
      await sendScheduledReport(row);

      // Update last_sent
      const now = new Date().toISOString();
      if (DB_DRIVER === "postgres") {
        const pool = await db.connectionToSqlDB();
        await pool.query("UPDATE report_schedule SET last_sent=$1 WHERE id=$2", [now, id]);
      } else {
        const { default: sql } = await import("mssql");
        const pool = await db.connectionToSqlDB();
        await pool.request().input("id", sql.Int, id).input("now", sql.DateTime2, new Date()).query("UPDATE report_schedule SET last_sent=@now WHERE id=@id");
      }

      res.json({ ok: true, message: `Report "${row.name}" sent successfully` });
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });
}