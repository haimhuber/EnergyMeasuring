import { useAuth } from "../context/AuthContext";
import { useBreakers } from "../hooks/useBreakers";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

export default function ReportControls({ params, onChange, onGenerate, onGenerateMulti, loading }) {
  const { user } = useAuth();
  const { breakers } = useBreakers(user?.role);
  const isAdmin = user?.role === "admin";

  return (
    <div className="selector-section">
      <div className="selector-label">Report Generator</div>
      <div className="selector-title">Generate Energy Invoice</div>
      <div className="controls">
        <div className="ctrl-group">
          <label>Breaker</label>
          <select value={params.breakerId} onChange={(e) => onChange("breakerId", e.target.value)}>
            <option value="">— Select breaker —</option>
            {Object.values(breakers).sort((a, b) => Number(a.id) - Number(b.id)).map((b) => (
              <option key={b.id} value={b.id}>{b.displayName}</option>
            ))}
          </select>
        </div>
        <div className="ctrl-group">
          <label>From</label>
          <input type="date" value={params.from} onChange={(e) => onChange("from", e.target.value)} />
        </div>
        <div className="ctrl-group">
          <label>To</label>
          <input type="date" value={params.to} onChange={(e) => onChange("to", e.target.value)} />
        </div>
        <div className="ctrl-group">
          <label>View</label>
          <div className="view-toggle">
            {["hourly", "daily", "monthly"].map((v) => (
              <label key={v}>
                <input type="radio" name="view" value={v} checked={params.view === v} onChange={() => onChange("view", v)} />
                <span className="vt-btn">{v.charAt(0).toUpperCase() + v.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>
        <button className="btn-generate" onClick={onGenerate} disabled={loading}>
          Generate <span className="arrow">→</span>
        </button>
        {isAdmin && (
          <button className="btn-generate-total-cost" onClick={onGenerateMulti} disabled={loading}>
            Generate Total Cost <span className="arrow">→</span>
          </button>
        )}
      </div>
    </div>
  );
}