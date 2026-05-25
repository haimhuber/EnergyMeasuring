import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/api";
import "./AuthPages.css";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", username: "", password: "", role: "user" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    const { username, email, password, role } = form;
    if (!username || !email || !password) { setMsg("Please fill in all fields"); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setMsg("Please enter a valid email address"); return; }
    if (role === "admin" && !window.confirm("Are you sure you want to create an admin user?")) return;
    setLoading(true);
    try {
      await api.register({ username, email: email.toLowerCase(), password, role });
      setMsg("User created successfully... Redirecting...");
      setTimeout(() => navigate("/login"), 1000);
    } catch (e) {
      setMsg(e.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-header-row">
          <div className="auth-accent" />
          <h1>Register</h1>
        </div>
        <p className="auth-sub">Create a new user for ABB Energy Dashboard</p>
        <form onSubmit={handleSubmit}>
          <label>E-mail address</label>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" required />
          <label>Username</label>
          <input type="text" value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="Choose a username" required />
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Choose a password" required />
          <label>Role</label>
          <select value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <div className="auth-actions">
            <button type="submit" className="auth-btn full" style={{ background: "#1a7f37" }} disabled={loading}>
              {loading ? "Creating..." : "Create User"}
            </button>
            <button type="button" className="auth-btn" style={{ background: "#888" }} onClick={() => navigate("/login")}>
              Back
            </button>
          </div>
        </form>
        {msg && <div className="auth-msg">{msg}</div>}
      </div>
    </div>
  );
}