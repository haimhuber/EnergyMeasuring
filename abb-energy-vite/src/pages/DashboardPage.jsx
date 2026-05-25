import { useState } from "react";
import Navbar from "../components/Navbar";
import ReportControls from "../components/ReportControls";
import ReportCard from "../components/ReportCard";
import AbbModal from "../components/AbbModal";
import { useConsumption } from "../hooks/useConsumption";
import { useAuth } from "../context/AuthContext";
import { useBreakers } from "../hooks/useBreakers";
import { sortByTimestampAsc } from "../utils/format";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

export default function DashboardPage() {
  const { user } = useAuth();
  const { allBreakers } = useBreakers(user?.role);
  const { data, loading, error, fetch } = useConsumption();
  const [params, setParams] = useState({ breakerId: "", from: yesterdayStr(), to: todayStr(), view: "daily" });
  const [modal, setModal] = useState({ title: "", message: "" });
  const [status, setStatus] = useState({ type: "", text: "Select a breaker and date range to generate a report." });

  const onChange = (key, value) => setParams((p) => ({ ...p, [key]: value }));

  const showModal = (title, message) => setModal({ title, message });

  const handleGenerate = async () => {
    const { breakerId, from, to, view } = params;
    if (!breakerId) { showModal("Selection Error", "Please select a breaker before generating the report."); return; }
    if (!from || !to) { showModal("Selection Error", "Please select a date range."); return; }
    if (from > to) { showModal("Invalid Date Range", '"From" date is after "To" date.'); return; }
    setStatus({ type: "loading", text: "Fetching data..." });
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
    }
  };

  const breaker = allBreakers[String(params.breakerId)];

  return (
    <>
      <Navbar />
      <AbbModal title={modal.title} message={modal.message} onClose={() => setModal({ title: "", message: "" })} />

      <ReportControls params={params} onChange={onChange} onGenerate={handleGenerate} onGenerateMulti={() => showModal("Coming soon", "Multi-breaker report coming soon.")} loading={loading} />

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
          />
        )}
      </div>
    </>
  );
}