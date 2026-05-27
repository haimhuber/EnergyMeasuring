import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import AIChat from "../components/AIChat";
import SettingsModal from "../components/SettingsModal";
import { useBreakers } from "../hooks/useBreakers";
import { useAuth } from "../context/AuthContext";
import "./ReportSchedulerPage.css";

const FREQ_OPTIONS = [
  { value: "daily",   label: "Daily",   desc: "Every day" },
  { value: "weekly",  label: "Weekly",  desc: "Once a week" },
  { value: "monthly", label: "Monthly", desc: "Once a month" },
];
const DAYS_OF_WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const COLORS = ["#CC0010","#2255bb","#1a7f37","#f0a000","#7c3aed","#0891b2","#db2777"];

const TIME_OPTIONS = Array.from({length: 48}, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2,"0")}:${m}`;
});

const EMPTY_FORM = {
  name: "", breaker_ids: [], frequency: "daily",
  send_time: "23:30", send_day_week: 0, send_day_month: 1,
  recipients: "", active: true,
};

export default function ReportSchedulerPage() {
  const { user } = useAuth();
  const { allBreakers } = useBreakers(user?.role);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [toasts, setToasts] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const addToast = (msg, type = "ok", link = null) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type, link }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6000);
  };

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/report-schedules", { credentials: "include" });
      const data = await res.json();
      setSchedules(Array.isArray(data) ? data : []);
    } catch { setError("Failed to load schedules"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  const openNew = () => { setForm(EMPTY_FORM); setEditId(null); setShowForm(true); setError(""); };
  const openEdit = (s) => {
    setForm({ ...s, recipients: s.recipients.join(", ") });
    setEditId(s.id); setShowForm(true); setError("");
  };
  const cancelForm = () => { setShowForm(false); setEditId(null); setError(""); };

  const saveForm = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.breaker_ids.length) { setError("Select at least one breaker"); return; }
    const recips = form.recipients.split(",").map(r => r.trim()).filter(Boolean);
    if (!recips.length) { setError("At least one recipient required"); return; }
    setSaving(true); setError("");
    try {
      const body = { ...form, recipients: recips };
      const url = editId ? `/api/report-schedules/${editId}` : "/api/report-schedules";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); setError(d.detail || "Save failed"); return; }
      addToast(editId ? "✅ Schedule updated!" : "✅ Schedule created!", "ok");
      setShowForm(false); setEditId(null);
      await loadSchedules();
    } catch { setError("Save failed"); }
    finally { setSaving(false); }
  };

  const toggleActive = async (id) => {
    try {
      await fetch(`/api/report-schedules/${id}/toggle`, { method: "PATCH", credentials: "include" });
      await loadSchedules();
    } catch { setError("Toggle failed"); }
  };

  const deleteSchedule = async (id) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      await fetch(`/api/report-schedules/${id}`, { method: "DELETE", credentials: "include" });
      await loadSchedules();
      addToast("🗑 Schedule deleted", "ok");
    } catch { setError("Delete failed"); }
  };

  const sendNow = async (id, name) => {
    setSendingId(id);
    addToast(`⏳ Generating report "${name}"...`, "info");
    try {
      const res = await fetch(`/api/report-schedules/${id}/send-now`, { method: "POST", credentials: "include" });
      const d = await res.json();
      if (res.ok) {
        // Download PDF automatically
        if (d.filename) {
          const link = document.createElement("a");
          link.href = `/api/report-schedules/download/${d.filename}`;
          link.download = d.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          addToast(`💾 PDF downloaded: ${d.filename}`, "save");
        }
        // Show email status separately
        if (d.emailError) {
          addToast(`📧 Email not sent: ${d.emailError}`, "err");
        } else {
          addToast(`✅ Email sent successfully!`, "ok");
        }
        await loadSchedules();
      } else {
        addToast(d.detail || "Send failed", "err");
      }
    } catch { addToast("Send failed", "err"); }
    finally { setSendingId(null); }
  };

  const toggleBreaker = (id) => {
    setForm(f => ({
      ...f,
      breaker_ids: f.breaker_ids.includes(id)
        ? f.breaker_ids.filter(b => b !== id)
        : [...f.breaker_ids, id]
    }));
  };

  const breakerList = Object.entries(allBreakers).map(([id, b]) => ({ id: Number(id), ...b }));

  const fetchPreview = async (scheduleOrForm) => {
    setPreviewLoading(true);
    setPreviewHtml(null);
    try {
      const body = {
        breaker_ids: scheduleOrForm.breaker_ids,
        frequency: scheduleOrForm.frequency || "daily",
        name: scheduleOrForm.name || "Preview",
      };
      const res = await fetch("/api/report-schedules/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (res.ok) setPreviewHtml(d.html);
      else setError(d.detail || "Preview failed");
    } catch { setError("Preview failed"); }
    finally { setPreviewLoading(false); }
  };

  return (
    <>
      <Navbar onOpenChat={() => setShowChat(true)} onOpenSettings={() => setShowSettings(true)} />
      <div className="rsp-page">

        {/* Top bar */}
        <div className="rsp-topbar">
          <div className="rsp-title">
            <span className="rsp-label">Report Scheduler</span>
            <span className="rsp-sub">Manage automated energy reports</span>
          </div>
          {!showForm && (
            <button className="rsp-btn-new" onClick={openNew}>+ New schedule</button>
          )}
        </div>

        {/* Alerts */}
        {error && <div className="rsp-alert rsp-alert-err">{error} <button onClick={() => setError("")}>✕</button></div>}
        {success && <div className="rsp-alert rsp-alert-ok">{success}</div>}

        {/* Form */}
        {showForm && (
          <div className="rsp-form-card">
            <div className="rsp-form-header">
              <div className="rsp-form-title">{editId ? "Edit schedule" : "New schedule"}</div>
            </div>
            <div className="rsp-form-grid">

              {/* Name */}
              <div className="rsp-field rsp-field-full">
                <label>Schedule name</label>
                <input className="rsp-input" value={form.name}
                  onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  placeholder="e.g. Daily energy summary"/>
              </div>

              {/* Frequency */}
              <div className="rsp-field rsp-field-full">
                <label>Frequency</label>
                <div className="rsp-freq-btns">
                  {FREQ_OPTIONS.map(o => (
                    <button key={o.value}
                      className={`rsp-freq-btn${form.frequency === o.value ? " active" : ""}`}
                      onClick={() => setForm(f => ({...f, frequency: o.value}))}>
                      <span className="rsp-freq-label">{o.label}</span>
                      <span className="rsp-freq-desc">{o.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Time */}
              <div className="rsp-field">
                <label>Send time</label>
                <select className="rsp-input" value={form.send_time}
                  onChange={e => setForm(f => ({...f, send_time: e.target.value}))}>
                  {TIME_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Day of week */}
              {form.frequency === "weekly" && (
                <div className="rsp-field">
                  <label>Day of week</label>
                  <select className="rsp-input" value={form.send_day_week}
                    onChange={e => setForm(f => ({...f, send_day_week: Number(e.target.value)}))}>
                    {DAYS_OF_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}

              {/* Day of month */}
              {form.frequency === "monthly" && (
                <div className="rsp-field">
                  <label>Day of month</label>
                  <select className="rsp-input" value={form.send_day_month}
                    onChange={e => setForm(f => ({...f, send_day_month: Number(e.target.value)}))}>
                    {Array.from({length: 28}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {/* Recipients */}
              <div className="rsp-field rsp-field-full">
                <label>Recipients <span style={{color:"#555",fontWeight:400,textTransform:"none"}}>(comma separated)</span></label>
                <input className="rsp-input" value={form.recipients}
                  onChange={e => setForm(f => ({...f, recipients: e.target.value}))}
                  placeholder="email1@example.com, email2@example.com"/>
              </div>

              {/* Breakers */}
              <div className="rsp-field rsp-field-full">
                <label>Breakers <span style={{color:"#555",fontWeight:400,textTransform:"none"}}>({form.breaker_ids.length} selected)</span></label>
                <div className="rsp-breaker-grid">
                  {breakerList.map((b) => {
                    const idx = form.breaker_ids.indexOf(b.id);
                    const selected = idx >= 0;
                    return (
                      <div key={b.id}
                        className={`rsp-breaker-item${selected ? " selected" : ""}`}
                        style={selected ? {borderColor: COLORS[idx % COLORS.length], background: COLORS[idx % COLORS.length] + "15"} : {}}
                        onClick={() => toggleBreaker(b.id)}>
                        <span className="rsp-breaker-id">{b.id}</span>
                        <span className="rsp-breaker-name">{b.displayName || b.name}</span>
                        {selected && <span className="rsp-breaker-check" style={{color: COLORS[idx % COLORS.length]}}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rsp-form-actions">
              <button className="rsp-btn-cancel" onClick={cancelForm}>Cancel</button>
              <button className="rsp-btn-preview" onClick={() => fetchPreview(form)} disabled={!form.breaker_ids.length || previewLoading}>
                {previewLoading ? "Loading..." : "👁 Preview"}
              </button>
              <button className="rsp-btn-save" onClick={saveForm} disabled={saving}>
                {saving ? "Saving..." : editId ? "Update schedule" : "Create schedule"}
              </button>
            </div>
          </div>
        )}

        {/* Schedule list */}
        {!showForm && (
          loading ? (
            <div className="rsp-loading">Loading schedules...</div>
          ) : schedules.length === 0 ? (
            <div className="rsp-empty">
              <div className="rsp-empty-icon">📅</div>
              <div className="rsp-empty-text">No schedules yet</div>
              <div className="rsp-empty-sub">Create your first automated report schedule</div>
              <button className="rsp-btn-new" style={{marginTop:16}} onClick={openNew}>+ New schedule</button>
            </div>
          ) : (
            <div className="rsp-list">
              {schedules.map(s => (
                <div key={s.id} className={`rsp-card${s.active ? "" : " rsp-card-inactive"}`}>
                  <div className="rsp-card-body">
                    <div className="rsp-card-main">
                      <div className="rsp-card-name">{s.name}</div>
                      <div className="rsp-card-meta">
                        <span className={`rsp-freq-badge rsp-freq-${s.frequency}`}>{s.frequency}</span>
                        <span className="rsp-card-info">⏰ {s.send_time}</span>
                        {s.frequency === "weekly" && <span className="rsp-card-info">{DAYS_OF_WEEK[s.send_day_week]}</span>}
                        {s.frequency === "monthly" && <span className="rsp-card-info">Day {s.send_day_month}</span>}
                        <span className="rsp-card-info">📧 {s.recipients.join(", ")}</span>
                      </div>
                      <div className="rsp-card-breakers">
                        {s.breaker_ids.slice(0, 6).map((id, i) => (
                          <span key={id} className="rsp-chip" style={{borderColor: COLORS[i % COLORS.length], color: COLORS[i % COLORS.length]}}>
                            {allBreakers[String(id)]?.displayName || `Breaker ${id}`}
                          </span>
                        ))}
                        {s.breaker_ids.length > 6 && <span className="rsp-chip-more">+{s.breaker_ids.length - 6}</span>}
                      </div>
                      {s.last_sent && <div className="rsp-last-sent">Last sent: {new Date(s.last_sent).toLocaleString()}</div>}
                    </div>

                    <div className="rsp-card-side">
                      <label className="rsp-toggle">
                        <input type="checkbox" checked={s.active} onChange={() => toggleActive(s.id)}/>
                        <span className="rsp-toggle-slider"/>
                      </label>
                      <div className="rsp-card-actions">
                        <button className="rsp-action-btn rsp-action-preview"
                          onClick={() => fetchPreview(s)}>
                          👁 Preview
                        </button>
                        <button className="rsp-action-btn rsp-action-send"
                          onClick={() => sendNow(s.id, s.name)}
                          disabled={sendingId === s.id}>
                          {sendingId === s.id ? "Sending..." : "▶ Send now"}
                        </button>
                        <a className="rsp-action-btn rsp-action-download"
                          href={`/api/report-schedules/download-last/${s.id}`}
                          download>
                          ⬇ Download PDF
                        </a>
                        <button className="rsp-action-btn rsp-action-edit" onClick={() => openEdit(s)}>✏ Edit</button>
                        <button className="rsp-action-btn rsp-action-del" onClick={() => deleteSchedule(s.id)}>✕ Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

      </div>
      {/* Preview modal */}
      {(previewHtml || previewLoading) && (
        <div className="rsp-preview-overlay" onClick={e => e.target.classList.contains("rsp-preview-overlay") && setPreviewHtml(null)}>
          <div className="rsp-preview-modal">
            <div className="rsp-preview-header">
              <span>Report Preview</span>
              <button onClick={() => { setPreviewHtml(null); setPreviewLoading(false); }}>✕</button>
            </div>
            <div className="rsp-preview-body">
              {previewLoading ? (
                <div className="rsp-loading" style={{padding:60}}>Generating preview...</div>
              ) : (
                <iframe
                  srcDoc={previewHtml}
                  style={{width:"100%",height:"100%",border:"none",background:"#fff"}}
                  title="Report Preview"
                />
              )}
            </div>
          </div>
        </div>
      )}
      {/* Toast notifications */}
      <div style={{position:"fixed",bottom:24,right:24,display:"flex",flexDirection:"column",gap:8,zIndex:99999}}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type==="err"?"#CC0010":t.type==="save"?"#2255bb":t.type==="info"?"#555":"#1a7f37",
            color:"#fff", padding:"12px 16px", borderRadius:8, fontSize:13, fontWeight:500,
            boxShadow:"0 4px 20px rgba(0,0,0,0.4)", minWidth:300, maxWidth:420,
            display:"flex", flexDirection:"column", gap:4,
            animation:"slideIn 0.2s ease", cursor: t.link ? "pointer" : "default"
          }}>
            <span>{t.msg}</span>
            {t.link && (
              <span style={{fontSize:11,opacity:0.8,fontFamily:"monospace",wordBreak:"break-all"}}>
                📁 {t.link}
              </span>
            )}
          </div>
        ))}
      </div>
      {showChat && <AIChat onClose={() => setShowChat(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}