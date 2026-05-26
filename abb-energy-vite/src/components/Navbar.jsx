import { useState, useEffect } from "react";
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

  useEffect(() => {
    api.location()
      .then((d) => setLocation(d?.location?.[0]?.LocationName || "-"))
      .catch(() => {});
  }, []);

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
          <div className={`sb-item${window.location.pathname==="/"?" active":""}`} onClick={()=>window.location.href="/"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Report &amp; Billing
          </div>
          <div className={`sb-item${window.location.pathname==="/dashboard"?" active":""}`} onClick={()=>window.location.href="/dashboard"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v6H3z"/></svg>
            Dashboard
          </div>
          <div className="sb-item" onClick={() => onOpenChat?.()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10a9.96 9.96 0 0 1-5.19-1.45L2 22l1.45-4.81A9.96 9.96 0 0 1 2 12 10 10 0 0 1 12 2z"/></svg>
            AI Assistant
          </div>

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
          <Clock />
          <button className="sb-logout" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </button>
        </div>
      </aside>

    </>
  );
}