import { useState } from "react";
import Navbar from "../components/Navbar";
import AIChat from "../components/AIChat";
import SettingsModal from "../components/SettingsModal";
import ReportControls from "../components/ReportControls";
import ReportCard from "../components/ReportCard";
import AbbModal from "../components/AbbModal";
import { useConsumption } from "../hooks/useConsumption";
import { useAuth } from "../context/AuthContext";
import { useBreakers } from "../hooks/useBreakers";
import { api } from "../api/api";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

const BREAKER_COLORS = ["#CC0010","#2255bb","#1a7f37","#f0a000","#7c3aed"];

export default function DashboardPage() {
  const { user } = useAuth();
  const { allBreakers } = useBreakers(user?.role);
  const { data, loading, error, fetch } = useConsumption();
  const [params, setParams] = useState({ breakerId: "", from: yesterdayStr(), to: todayStr(), view: "daily" });
  const [modal, setModal] = useState({ title: "", message: "" });
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState({ type: "", text: "Select a breaker and date range to generate a report." });

  // Multi-breaker state
  const [extraBreakers, setExtraBreakers] = useState([]); // [{id, color, data, loading}]
  const [showAddBreaker, setShowAddBreaker] = useState(false);
  const [addBreakerInput, setAddBreakerInput] = useState("");

  const onChange = (key, value) => setParams((p) => ({ ...p, [key]: value }));
  const showModal = (title, message) => setModal({ title, message });

  const handleGenerate = async () => {
    const { breakerId, from, to, view } = params;
    if (!breakerId) { showModal("Selection Error", "Please select a breaker before generating the report."); return; }
    if (!from || !to) { showModal("Selection Error", "Please select a date range."); return; }
    if (from > to) { showModal("Invalid Date Range", '"From" date is after "To" date.'); return; }
    setStatus({ type: "loading", text: "Fetching data..." });

    // Fetch main breaker
    try {
      const result = await fetch(breakerId, from, to, view);
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      if (rows.length === 0) {
        setStatus({ type: "", text: `No data for breaker ${breakerId} in selected period.` });
        return;
      }
      const name = allBreakers[String(breakerId)]?.name || `Breaker ${breakerId}`;
      setStatus({ type: "active", text: `Report ready — ${name} | ${view} | ${from} → ${to}` });
    } catch (e) {
      if (e.status === 401) { showModal("Session Expired", "Please log in again."); window.location.href = "/login"; return; }
      setStatus({ type: "", text: `Error: ${e.message || e}` });
      return;
    }

    // Fetch extra breakers
    if (extraBreakers.length > 0) {
      const updated = extraBreakers.map(b => ({ ...b, loading: true, data: null }));
      setExtraBreakers(updated);
      const results = await Promise.allSettled(
        updated.map(b => api.consumption(b.id, from, to, view))
      );
      setExtraBreakers(updated.map((b, i) => ({
        ...b,
        loading: false,
        data: results[i].status === "fulfilled" ? results[i].value : null,
      })));
    }
  };

  const addBreaker = async () => {
    const id = addBreakerInput.trim();
    if (!id) return;
    if (extraBreakers.length >= 4) { showModal("Limit reached", "You can compare up to 5 breakers total."); return; }
    if (extraBreakers.find(b => b.id === id) || id === String(params.breakerId)) {
      showModal("Already added", "This breaker is already in the comparison."); return;
    }
    const colorIndex = extraBreakers.length + 1;
    const newBreaker = { id, color: BREAKER_COLORS[colorIndex], data: null, loading: true };
    setExtraBreakers(prev => [...prev, newBreaker]);
    setAddBreakerInput("");
    setShowAddBreaker(false);

    // Fetch data immediately
    try {
      const result = await api.consumption(id, params.from, params.to, params.view);
      setExtraBreakers(prev => prev.map(b => b.id === id ? { ...b, data: result, loading: false } : b));
    } catch {
      setExtraBreakers(prev => prev.map(b => b.id === id ? { ...b, loading: false } : b));
    }
  };

  const removeBreaker = (id) => setExtraBreakers(prev => prev.filter(b => b.id !== id));

  const breaker = allBreakers[String(params.breakerId)];

  return (
    <>
      <Navbar onOpenChat={() => setShowChat(true)} onOpenSettings={() => setShowSettings(true)} />
      <AbbModal title={modal.title} message={modal.message} onClose={() => setModal({ title: "", message: "" })} />

      <ReportControls params={params} onChange={onChange} onGenerate={handleGenerate} onGenerateMulti={() => showModal("Coming soon", "Multi-breaker report coming soon.")} loading={loading} />

      {/* Breaker comparison bar */}
      <div className="breaker-compare-bar">
        <div className="breaker-compare-chips">
          {/* Main breaker chip */}
          {params.breakerId && (
            <div className="breaker-chip" style={{borderColor: BREAKER_COLORS[0], color: BREAKER_COLORS[0]}}>
              <span className="breaker-chip-dot" style={{background: BREAKER_COLORS[0]}}/>
              {allBreakers[String(params.breakerId)]?.displayName || `Breaker ${params.breakerId}`}
            </div>
          )}
          {/* Extra breaker chips */}
          {extraBreakers.map((b) => (
            <div key={b.id} className="breaker-chip" style={{borderColor: b.color, color: b.color}}>
              <span className="breaker-chip-dot" style={{background: b.color}}/>
              {allBreakers[String(b.id)]?.displayName || `Breaker ${b.id}`}
              <button className="breaker-chip-remove" onClick={() => removeBreaker(b.id)}>✕</button>
            </div>
          ))}
          {/* Add button */}
          {extraBreakers.length < 4 && params.breakerId && data && (
            <>
              {showAddBreaker ? (
                <div className="breaker-add-input">
                  <select
                    value={addBreakerInput}
                    onChange={e => setAddBreakerInput(e.target.value)}
                    className="breaker-add-select"
                  >
                    <option value="">Select breaker...</option>
                    {Object.entries(allBreakers)
                      .filter(([id]) => id !== String(params.breakerId) && !extraBreakers.find(b => b.id === id))
                      .map(([id, b]) => (
                        <option key={id} value={id}>{b.displayName || b.name}</option>
                      ))}
                  </select>
                  <button className="breaker-add-confirm" onClick={addBreaker}>Add</button>
                  <button className="breaker-add-cancel" onClick={() => setShowAddBreaker(false)}>✕</button>
                </div>
              ) : (
                <button className="breaker-add-btn" onClick={() => setShowAddBreaker(true)}>
                  + Compare breaker
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="status-bar">
        <div className={`status-dot${status.type ? " " + status.type : ""}`} />
        <span>{status.text}</span>
      </div>

      <div className="report-area">
        {!data && !loading && !error && (
          <div className="placeholder" id="placeholder">
            <div className="big">
              <svg width="160" height="48" viewBox="0 0 160 48" xmlns="http://www.w3.org/2000/svg">
                <text x="0" y="36" fontFamily="DM Sans, Arial, sans-serif" fontWeight="900" fontSize="36" fill="rgba(255,255,255,0.95)">ABB</text>
              </svg>
            </div>
            <div className="sm">Awaiting selection</div>
          </div>
        )}

        {loading && (
          <div className="placeholder">
            <div className="loading-spinner" />
            <div className="sm" style={{ marginTop: 16 }}>Loading...</div>
          </div>
        )}

        {!loading && data && Array.isArray(data.rows) && data.rows.length === 0 && (
          <div className="no-data visible">
            <div className="nd-icon">⚡</div>
            <div className="nd-text">No consumption data for this breaker in the selected period.</div>
          </div>
        )}

        {!loading && data && Array.isArray(data.rows) && data.rows.length > 0 && (
          <ReportCard
              data={data}
              breakerName={breaker?.name || `Breaker ${params.breakerId}`}
              view={params.view}
              from={params.from}
              to={params.to}
              extraBreakers={extraBreakers.map(b => ({
                ...b,
                name: allBreakers[String(b.id)]?.name || `Breaker ${b.id}`,
              }))}
            />
        )}
      </div>
      {showChat && <AIChat onClose={() => setShowChat(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}