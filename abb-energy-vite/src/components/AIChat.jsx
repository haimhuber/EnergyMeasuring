import { useState, useRef, useEffect } from "react";
import { api } from "../api/api";

const QUICK = [
  "מה הצריכה הכוללת היום?",
  "איזה מפסק צרך הכי הרבה?",
  "האם היו פיקים חריגים?",
  "מה העלות הכוללת החודש?",
];

const S = {
  overlay: {
    position: "fixed", top: 0, left: 0,
    width: "100vw", height: "100vh",
    background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 999999,
  },
  modal: {
    width: 480, maxWidth: "92vw",
    height: 600, maxHeight: "88vh",
    background: "#0f1114",
    border: "0.5px solid #252830",
    borderRadius: 16,
    display: "flex", flexDirection: "column",
    overflow: "hidden",
    fontFamily: "'Inter', 'DM Sans', sans-serif",
  },
  head: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    borderBottom: "0.5px solid #1e2025",
    flexShrink: 0,
  },
  headLeft: { display: "flex", alignItems: "center", gap: 12 },
  icon: {
    width: 36, height: 36, borderRadius: 10,
    background: "rgba(204,0,16,0.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18, flexShrink: 0,
  },
  title: { fontSize: 14, fontWeight: 500, color: "#fff", margin: 0 },
  sub: { fontSize: 11, color: "#555", margin: 0, marginTop: 2 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 8,
    background: "rgba(255,255,255,0.06)",
    border: "none", color: "#888",
    fontSize: 16, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  body: {
    flex: 1, overflowY: "auto",
    padding: 16,
    display: "flex", flexDirection: "column", gap: 14,
    direction: "rtl",
  },
  msgWrapAssistant: { display: "flex", alignItems: "flex-start", gap: 8 },
  msgWrapUser: { display: "flex", alignItems: "flex-start", gap: 8, flexDirection: "row-reverse" },
  avatarAssistant: {
    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
    background: "rgba(204,0,16,0.12)", color: "#CC0010",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14,
  },
  avatarUser: {
    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
    background: "rgba(255,255,255,0.08)", color: "#888",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 500,
  },
  bubbleAssistant: {
    maxWidth: "78%", padding: "10px 14px",
    borderRadius: 14, borderBottomRightRadius: 4,
    background: "#161820", color: "#ddd",
    border: "0.5px solid #1e2025",
    fontSize: 13, lineHeight: 1.6,
    direction: "rtl", textAlign: "right",
    whiteSpace: "pre-wrap", wordBreak: "break-word",
  },
  bubbleUser: {
    maxWidth: "78%", padding: "10px 14px",
    borderRadius: 14, borderBottomLeftRadius: 4,
    background: "#CC0010", color: "#fff",
    fontSize: 13, lineHeight: 1.6,
    direction: "rtl", textAlign: "right",
    whiteSpace: "pre-wrap", wordBreak: "break-word",
  },
  quickWrap: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, justifyContent: "flex-end" },
  quickBtn: {
    padding: "5px 11px",
    background: "#0a0b0d",
    border: "0.5px solid #252830",
    borderRadius: 20, color: "#888",
    fontSize: 11, cursor: "pointer",
    direction: "rtl", fontFamily: "inherit",
  },
  foot: {
    padding: "12px 14px 14px",
    borderTop: "0.5px solid #1e2025",
    background: "#0a0b0d", flexShrink: 0,
  },
  inputRow: { display: "flex", gap: 8, alignItems: "flex-end", direction: "rtl" },
  textarea: {
    flex: 1, background: "#161820",
    border: "0.5px solid #252830",
    borderRadius: 10, color: "#ddd",
    fontSize: 13, padding: "10px 12px",
    resize: "none", outline: "none",
    direction: "rtl", textAlign: "right",
    fontFamily: "inherit", minHeight: 40, maxHeight: 100,
    lineHeight: 1.5,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 10,
    background: "#CC0010", border: "none",
    color: "#fff", fontSize: 18, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  sendBtnDisabled: {
    width: 40, height: 40, borderRadius: 10,
    background: "#3a0005", border: "none",
    color: "#7a0010", fontSize: 18, cursor: "not-allowed",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  note: { fontSize: 10, color: "#333", textAlign: "center", marginTop: 8, direction: "rtl" },
  typingWrap: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "12px 16px",
    background: "#161820", border: "0.5px solid #1e2025",
    borderRadius: 14, borderBottomRightRadius: 4,
  },
};

export default function AIChat({ onClose }) {
  const [messages, setMessages] = useState([{
    role: "assistant",
    text: "שלום! אני כאן לעזור לך לנתח את נתוני האנרגיה.\nאפשר לשאול למשל:\n• איזה מפסק צרך הכי הרבה השבוע?\n• האם היו פיקים חריגים?\n• מה העלות הכוללת החודש?"
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const data = await api.aiQuery(q);
      setMessages((m) => [...m, { role: "assistant", text: data.answer || "לא התקבלה תשובה." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "לא ניתן היה להתחבר לשרת." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.head}>
          <div style={S.headLeft}>
            <div style={S.icon}>⚡</div>
            <div>
              <div style={S.title}>עוזר AI — מערכת אנרגיה</div>
              <div style={S.sub}>מבוסס על נתוני הצריכה בזמן אמת</div>
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={S.body} ref={bodyRef}>
          {messages.map((m, i) => (
            <div key={i} style={m.role === "assistant" ? S.msgWrapAssistant : S.msgWrapUser}>
              <div style={m.role === "assistant" ? S.avatarAssistant : S.avatarUser}>
                {m.role === "assistant" ? "⚡" : "HA"}
              </div>
              <div>
                <div style={m.role === "assistant" ? S.bubbleAssistant : S.bubbleUser}>
                  {m.text}
                </div>
                {m.role === "assistant" && i === 0 && (
                  <div style={S.quickWrap}>
                    {QUICK.map((q) => (
                      <button key={q} style={S.quickBtn} onClick={() => send(q)}>{q}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={S.msgWrapAssistant}>
              <div style={S.avatarAssistant}>⚡</div>
              <div style={S.typingWrap}>
                {[0,1,2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "#444", display: "inline-block",
                    animation: `aidot 1.2s ${i*0.2}s ease-in-out infinite`
                  }}/>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.foot}>
          <div style={S.inputRow}>
            <button
              style={loading || !input.trim() ? S.sendBtnDisabled : S.sendBtn}
              onClick={() => send()}
              disabled={loading || !input.trim()}
            >↑</button>
            <textarea
              style={S.textarea}
              placeholder="...כתוב שאלה"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
              rows={1}
              autoFocus
            />
          </div>
          <div style={S.note}>התשובות מבוססות על הנתונים במערכת ועלולות לכלול הערכה</div>
        </div>

      </div>
      <style>{`@keyframes aidot{0%,80%,100%{opacity:.4;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}