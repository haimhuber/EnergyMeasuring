import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTariffs } from "../context/TariffContext";
import { api } from "../api/api";

export default function SettingsModal({ onClose }) {
  const { tariffs, vat, updateTariffs } = useTariffs();
  const [form, setForm] = useState({ winter: { off: "", peak: "" }, shoulder: { off: "", peak: "" }, summer: { off: "", peak: "" }, vat: "" });
  const [location, setLocation] = useState("");
  const [cities, setCities] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (tariffs) {
      setForm({
        winter: { off: tariffs.winter?.off ?? "", peak: tariffs.winter?.peak ?? "" },
        shoulder: { off: tariffs.shoulder?.off ?? "", peak: tariffs.shoulder?.peak ?? "" },
        summer: { off: tariffs.summer?.off ?? "", peak: tariffs.summer?.peak ?? "" },
        vat: vat ?? "",
      });
    }
    api.location().then((d) => setLocation(d?.location?.[0]?.LocationName || "")).catch(() => {});
    api.cities().then((d) => {
      const list = d?.cities?.cities?.city || [];
      setCities(list.map((c) => c.english_name?.[0]).filter(Boolean));
    }).catch(() => {});
  }, [tariffs, vat]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateTariffs(form);
      if (location) await api.updateLocation(location);
      setMsg("Saved successfully!");
      setTimeout(onClose, 1000);
    } catch (err) {
      setMsg("Error: " + (err.message || "Failed to save"));
    }
  };

  const setField = (season, field, value) =>
    setForm((f) => ({ ...f, [season]: { ...f[season], [field]: value } }));

  const seasons = ["winter", "shoulder", "summer"];

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true">
        <div className="modal-header">
          <span>Settings</span>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <table className="tariff-table">
              <thead><tr><th>Season</th><th>Off Rate</th><th>Peak Rate</th></tr></thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s}>
                    <td style={{ textTransform: "capitalize" }}>{s}</td>
                    <td><input type="number" step="0.0001" min="0" value={form[s]?.off ?? ""} onChange={(e) => setField(s, "off", e.target.value)} required /></td>
                    <td><input type="number" step="0.0001" min="0" value={form[s]?.peak ?? ""} onChange={(e) => setField(s, "peak", e.target.value)} required /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ margin: "12px 0" }}>
              <label>VAT Rate: </label>
              <input type="number" step="0.0001" min="0" value={form.vat} onChange={(e) => setForm((f) => ({ ...f, vat: e.target.value }))} style={{ width: 100, marginLeft: 8 }} required />
            </div>
            <div style={{ margin: "12px 0" }}>
              <label>Location</label>
              <input list="cities-list" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Start typing city..." style={{ display: "block", width: "100%", marginTop: 4 }} />
              <datalist id="cities-list">
                {cities.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            {msg && <div style={{ color: msg.startsWith("Error") ? "#e53935" : "#1a7f37", marginBottom: 8 }}>{msg}</div>}
            <button type="submit" className="btn-save-tariff">Save</button>
          </form>
        </div>
      </div>
    </div>
  );
}