import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AuthPages.css";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setMsg("");
    if (!email || !password) { setMsg("Please enter email and password"); return; }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      setMsg("Login successful! Redirecting...");
      setTimeout(() => navigate("/"), 1000);
    } catch (e) {
      setMsg(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-header-row">
          <div className="auth-accent" />
          <h1>Log in</h1>
        </div>
        <p className="auth-sub">Sign in to access the Energy Dashboard</p>
        <label>E-mail address</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
          onKeyDown={(e) => e.key === "Enter" && handleLogin()} autoComplete="email" />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password"
          onKeyDown={(e) => e.key === "Enter" && handleLogin()} autoComplete="current-password" />
        <div className="auth-actions">
          <button className="auth-btn full" onClick={handleLogin} disabled={loading}>
            {loading ? "Signing in..." : "LOGIN"}
          </button>
        </div>
        <div className="auth-actions">
          <button className="auth-btn full" style={{ background: "#1a7f37" }} onClick={() => navigate("/register")}>
            Register
          </button>
        </div>
        {msg && <div className="auth-msg">{msg}</div>}
      </div>
    </div>
  );
}