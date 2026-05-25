export const fmtMoney = (n) => Number(n || 0).toFixed(2);
export const fmtKwh = (n) => {
  const x = Number(n || 0);
  return Number.isInteger(x) ? String(x) : x.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
};
export const fmtRate = (n) => {
  if (n === "-" || n == null) return "-";
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(4) : "-";
};
export const gbDate = (isoDate) => {
  const s = String(isoDate || "");
  if (/^\d{4}-\d{2}$/.test(s)) return gbMonth(s);
  const [Y, M, D] = s.split("-");
  return `${D}/${M}/${Y}`;
};
export const gbStamp = (iso) => {
  if (!iso) return "";
  const s = String(iso);
  if (!s.includes(" ")) return s;
  const [d, t] = s.split(" ");
  const [Y, M, D] = d.split("-");
  return `${D}/${M} ${t}`;
};
export const gbMonth = (ym) => {
  const s = String(ym || "");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parts = s.split("-");
  if (parts.length < 2) return s;
  const M = Number(parts[1]);
  return (M >= 1 && M <= 12) ? `${names[M - 1]} ${parts[0]}` : s;
};
export const shortDay = (isoDate) => { const [, M, D] = String(isoDate).split("-"); return `${D}/${M}`; };
export const shortMonth = (ym) => gbMonth(ym);
export const hhFromStamp = (stamp) => { const s = String(stamp || ""); return s.includes(" ") ? s.split(" ")[1] : s; };
export const seasonLabel = (s) => ({ winter: "Winter", summer: "Summer", shoulder: "Transition" }[s] || s || "-");
export const sortByTimestampAsc = (rows) => [...rows].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));