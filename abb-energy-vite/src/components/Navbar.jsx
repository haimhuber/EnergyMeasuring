import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useTariffs } from "../context/TariffContext";
import { api } from "../api/api";

import "./Navbar.css";

const SEASON_LABELS = { winter: "Winter ❄️", shoulder: "Shoulder 🍂", summer: "Summer 🌞" };

function Clock() {
  const fmt = () => new Date().toLocaleString([], {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setTime(fmt()), 60000);
    return () => clearInterval(id);
  }, []);
  return <span className="sb-time">{time}</span>;
}

export default function Sidebar({ onOpenChat, onOpenSettings }) {
  const { user, logout } = useAuth();
  const { tariffs, season } = useTariffs();
  const [location, setLocation] = useState("-");
  const [updateState, setUpdateState] = useState({ hasUpdate: false, checking: false, applying: false, localCommit: null, remoteCommit: null });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.location()
      .then((d) => setLocation(d?.location?.[0]?.LocationName || "-"))
      .catch(() => {});
  }, []);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const checkForUpdates = useCallback(async () => {
    setUpdateState(s => ({ ...s, checking: true }));
    try {
      const res = await fetch("/api/updates/check", { credentials: "include" });
      const d = await res.json();
      setUpdateState({ hasUpdate: d.hasUpdate, checking: false, applying: false, localCommit: d.localCommit, remoteCommit: d.remoteCommit });
      if (!d.hasUpdate) showToast("✅ Up to date — no updates available", "ok");
      else showToast("⬆ Update available: " + d.remoteCommit, "update");
    } catch {
      setUpdateState(s => ({ ...s, checking: false }));
      showToast("❌ Check failed", "err");
    }
  }, []);

  const applyUpdate = async () => {
    if (!confirm("Apply update " + updateState.remoteCommit + "?\n\nServer will restart in ~30 seconds.")) return;
    setUpdateState(s => ({ ...s, applying: true }));
    await fetch("/api/updates/apply", { method: "POST", credentials: "include" });
    showToast("⬆ Update started — reloading in 60s...", "update");
    setTimeout(() => window.location.reload(), 60000);
  };

  const initials = (user?.username || "?").slice(0, 2).toUpperCase();
  const currentTariff = tariffs?.[season];

  return (
    <>
      <aside className="sidebar">
        <div className="sb-logo">
          <div className="sb-logo-text">ABB</div>
          <div className="sb-logo-sub">Energy Monitoring</div>
        </div>

        <div className="sb-user">
          <div className="sb-avatar">{initials}</div>
          <div>
            <div className="sb-uname">{user?.username || "—"}</div>
            <div className="sb-urole">{user?.role || "guest"}</div>
          </div>
        </div>

        <nav className="sb-nav">
          <div className="sb-section">Main</div>
          <div className={`sb-item${window.location.pathname === "/dashboard" ? " active" : ""}`} onClick={() => window.location.href = "/dashboard"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v6H3z"/></svg>
            Dashboard
          </div>
          <div className={`sb-item${window.location.pathname === "/" ? " active" : ""}`} onClick={() => window.location.href = "/"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Report &amp; Billing
          </div>
          <div className="sb-item" onClick={() => onOpenChat?.()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10a9.96 9.96 0 0 1-5.19-1.45L2 22l1.45-4.81A9.96 9.96 0 0 1 2 12 10 10 0 0 1 12 2z"/></svg>
            AI Assistant
          </div>

          {user?.role === "admin" && (
            <div className={`sb-item sb-item-highlight${window.location.pathname === "/report-scheduler" ? " active" : ""}`} onClick={() => window.location.href = "/report-scheduler"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
              </svg>
              Report Scheduler
            </div>
          )}

          <div className="sb-section">Current Season</div>
          <div className="sb-season-card">
            <div className="sb-season-dot" />
            <div>
              <div className="sb-season-name">{SEASON_LABELS[season] || season}</div>
              {currentTariff && (
                <div className="sb-season-rates">
                  Off: {currentTariff.off} &nbsp;|&nbsp; Peak: {currentTariff.peak}
                </div>
              )}
            </div>
          </div>

          {user?.role === "admin" && (
            <>
              <div className="sb-section">Settings</div>

              {updateState.hasUpdate && (
                <div className="sb-item sb-item-update" onClick={applyUpdate}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  {updateState.applying ? "Updating..." : "⬆ Update now (" + updateState.remoteCommit + ")"}
                </div>
              )}

              <div className="sb-item" onClick={checkForUpdates} style={{ opacity: updateState.checking ? 0.6 : 1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                {updateState.checking ? "Checking..." : "Check for updates"}
              </div>

              <div className="sb-item" onClick={() => onOpenSettings?.()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Tariff Settings
              </div>
              <div className="sb-item sb-location">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span className="sb-location-text">{location}</span>
              </div>
            </>
          )}
        </nav>

        <div className="sb-bottom">
          <div className="sb-version">
            ABB v{process.env.VITE_APP_VERSION || "dev"}
            <span style={{display:"block",fontSize:10,color:"#333",fontWeight:400}}>{process.env.VITE_BUILD_TIME || ""}</span>
          </div>
          <Clock />
          <button className="sb-logout" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </button>
        </div>
      </aside>

      {toast && (
        <div style={{
          position: "fixed", bottom: 16, left: 16,
          background: toast.type === "err" ? "#CC0010" : toast.type === "update" ? "#f0a000" : "#1a7f37",
          color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 12, fontWeight: 500,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)", zIndex: 99999, maxWidth: 280,
        }}>{toast.msg}</div>
      )}
    </>
  );
}