// =========================
// 14) Report Schedules API
// =========================

function parseScheduleRow(row, driver) {
  if (driver === "postgres") {
    return {
      id:             row.id,
      name:           row.name,
      breaker_ids:    Array.isArray(row.breaker_ids) ? row.breaker_ids : [],
      frequency:      row.frequency,
      send_time:      row.send_time,
      send_day_week:  row.send_day_week,
      send_day_month: row.send_day_month,
      recipients:     Array.isArray(row.recipients) ? row.recipients : [],
      active:         row.active,
      created_at:     row.created_at,
      last_sent:      row.last_sent,
    };
  }

  // mssql — send_time comes as Date object with epoch 1970 (TIME column)
  // Use local hours (not UTC) to preserve the original stored time
  let cleanTime = "23:30";
  if (row.send_time) {
    if (row.send_time instanceof Date) {
      const h = String(row.send_time.getHours()).padStart(2, "0");
      const m = String(row.send_time.getMinutes()).padStart(2, "0");
      cleanTime = `${h}:${m}`;
    } else {
      cleanTime = String(row.send_time).slice(0, 5);
    }
  }

  return {
    id:             row.id,
    name:           row.name,
    breaker_ids:    JSON.parse(row.breaker_ids || "[]").map(Number),
    frequency:      row.frequency,
    send_time:      cleanTime,
    send_day_week:  row.send_day_week,
    send_day_month: row.send_day_month,
    recipients:     JSON.parse(row.recipients || "[]"),
    active:         row.active === true || row.active === 1,
    created_at:     row.created_at,
    last_sent:      row.last_sent,
  };
}

// Escape single quotes for MSSQL string injection
function esc(s) { return String(s ?? "").replace(/'/g, "''"); }

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
          `INSERT INTO report_schedule (name,breaker_ids,frequency,send_time,send_day_week,send_day_month,recipients,active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [name, breaker_ids, frequency, send_time, send_day_week ?? 0, send_day_month ?? 1, recipients, active !== false]
        );
        row = result.rows[0];
      } else {
        const pool = await db.connectionToSqlDB();
        const sql = `
          INSERT INTO report_schedule (name,breaker_ids,frequency,send_time,send_day_week,send_day_month,recipients,active)
          OUTPUT INSERTED.*
          VALUES (
            N'${esc(name)}',
            N'${esc(JSON.stringify(breaker_ids))}',
            N'${esc(frequency)}',
            N'${esc(send_time)}',
            ${Number(send_day_week ?? 0)},
            ${Number(send_day_month ?? 1)},
            N'${esc(JSON.stringify(recipients))}',
            ${active !== false ? 1 : 0}
          )`;
        const result = await pool.request().query(sql);
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
          `UPDATE report_schedule SET name=$1,breaker_ids=$2,frequency=$3,send_time=$4,
           send_day_week=$5,send_day_month=$6,recipients=$7,active=$8
           WHERE id=$9 RETURNING *`,
          [name, breaker_ids, frequency, send_time, send_day_week ?? 0, send_day_month ?? 1, recipients, active !== false, id]
        );
        if (!result.rows.length) return res.status(404).json({ detail: "Schedule not found" });
        row = result.rows[0];
      } else {
        const pool = await db.connectionToSqlDB();
        const sql = `
          UPDATE report_schedule SET
            name=N'${esc(name)}',
            breaker_ids=N'${esc(JSON.stringify(breaker_ids))}',
            frequency=N'${esc(frequency)}',
            send_time=N'${esc(send_time)}',
            send_day_week=${Number(send_day_week ?? 0)},
            send_day_month=${Number(send_day_month ?? 1)},
            recipients=N'${esc(JSON.stringify(recipients))}',
            active=${active !== false ? 1 : 0}
          OUTPUT INSERTED.*
          WHERE id=${id}`;
        const result = await pool.request().query(sql);
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
        const pool = await db.connectionToSqlDB();
        const result = await pool.request().query(
          `UPDATE report_schedule SET active = 1 - active OUTPUT INSERTED.* WHERE id=${id}`
        );
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
        const pool = await db.connectionToSqlDB();
        await pool.request().query(`DELETE FROM report_schedule WHERE id=${id}`);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // GET download last PDF for a specific schedule
  app.get("/api/report-schedules/download-last/:id", authRequired, async (req, res) => {
    try {
      const { readdirSync, statSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const id = req.params.id;
      const folders = ["C:\\EnergyReports\\send-now", "C:\\EnergyReports\\today"];
      let allFiles = [];
      for (const folder of folders) {
        if (!existsSync(folder)) continue;
        const files = readdirSync(folder)
          .filter(f => f.endsWith(".pdf"))
          .map(f => ({ name: f, full: join(folder, f), time: statSync(join(folder, f)).mtime.getTime() }));
        allFiles = allFiles.concat(files);
      }
      allFiles.sort((a, b) => b.time - a.time);
      if (!allFiles.length) return res.status(404).json({ detail: "No reports found" });
      res.download(allFiles[0].full, allFiles[0].name);
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // GET download specific PDF by filename
  app.get("/api/report-schedules/download/:filename", authRequired, async (req, res) => {
    try {
      const { join } = await import("path");
      const { existsSync } = await import("fs");
      const filename = req.params.filename.replace(/\.\./g, ""); // prevent path traversal
      const folders = ["C:\\EnergyReports\\send-now", "C:\\EnergyReports\\today"];
      for (const folder of folders) {
        const full = join(folder, filename);
        if (existsSync(full)) return res.download(full, filename);
      }
      res.status(404).json({ detail: "File not found" });
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // GET download last report from C:/EnergyReports
  app.get("/api/report-schedules/last-report", authRequired, async (req, res) => {
    try {
      const { readdirSync, statSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const baseFolder = "C:\\EnergyReports";
      const subFolders = ["send-now", "today"];
      let allFiles = [];
      for (const sub of subFolders) {
        const dir = join(baseFolder, sub);
        if (!existsSync(dir)) continue;
        const files = readdirSync(dir)
          .filter(f => f.endsWith(".pdf"))
          .map(f => ({ name: f, full: join(dir, f), time: statSync(join(dir, f)).mtime.getTime() }));
        allFiles = allFiles.concat(files);
      }
      allFiles.sort((a, b) => b.time - a.time);
      if (!allFiles.length) return res.status(404).json({ detail: "No reports found" });
      res.download(allFiles[0].full, allFiles[0].name);
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });

  // POST preview
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

  // POST send now
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
        const pool = await db.connectionToSqlDB();
        const result = await pool.request().query(`SELECT * FROM report_schedule WHERE id=${id}`);
        if (!result.recordset.length) return res.status(404).json({ detail: "Not found" });
        row = parseScheduleRow(result.recordset[0], DB_DRIVER);
      }

      const { sendScheduledReport } = await import("../energyComsamption/emailReport.js");
      let sendResult = null;
      let emailError = null;
      try {
        sendResult = await sendScheduledReport(row);
      } catch (emailErr) {
        emailError = emailErr.message;
        console.error("Email error:", emailErr.message);
      }

      // Update last_sent
      if (DB_DRIVER === "postgres") {
        const pool = await db.connectionToSqlDB();
        await pool.query("UPDATE report_schedule SET last_sent=NOW() WHERE id=$1", [id]);
      } else {
        const pool = await db.connectionToSqlDB();
        await pool.request().query(`UPDATE report_schedule SET last_sent=GETDATE() WHERE id=${id}`);
      }

      res.json({
        ok: true,
        message: emailError
          ? `PDF saved but email failed`
          : `Report "${row.name}" sent successfully`,
        filename: sendResult?.filename,
        path: sendResult?.path,
        emailError: emailError || null,
      });
    } catch (err) {
      res.status(500).json({ detail: err.message });
    }
  });
}