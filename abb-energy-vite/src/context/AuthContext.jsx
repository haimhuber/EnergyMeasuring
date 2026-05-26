import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, setSessionExpiredHandler } from "../api/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionAlert, setSessionAlert] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const data = await api.me();
      if (data.ok) setUser(data.user);
      else setUser(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    // Check session every 10 minutes (skip if on login page)
    const interval = setInterval(() => {
      if (window.location.pathname !== "/login") checkAuth();
    }, 10 * 60 * 1000);

    // Register 401 handler
    setSessionExpiredHandler(() => {
      if (window.location.pathname === "/login") return;
      setUser(null);
      setSessionAlert(true);
      setTimeout(() => {
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }, 10 * 60 * 1000);
    });

    return () => clearInterval(interval);
  }, [checkAuth]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem("UserEmail", email);
    localStorage.setItem("Username", data?.user?.username || "");
    setUser(data.user);
    setSessionAlert(false);
    return data;
  };

  const logout = async () => {
    try { await api.logout(); } catch {}
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
      {sessionAlert && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#CC0010", color: "#fff", padding: "12px 24px",
          borderRadius: 10, fontSize: 14, fontWeight: 500,
          zIndex: 999999, boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          ⚠ Session expired — redirecting to login...
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);


//Some notes
// - The AuthProvider component manages authentication state and session expiry handling.