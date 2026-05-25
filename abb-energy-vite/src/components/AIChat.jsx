import { useState, useRef, useEffect } from "react";
import { api } from "../api/api";

export default function AIChat({ onClose }) {
  const [messages, setMessages] = useState([{ role: "assistant", text: "שלום, אני כאן כדי לעזור לך לנתח את נתוני האנרגיה שלך.\nאפשר לשאול למשל:\n• איזה מפסק צרך הכי הרבה השבוע?\n• האם היו פיקים חריגים?\n• מה הייתה הצריכה הגבוהה ביותר אתמול?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages]);

  const send = async () => {
    const q = input.trim();
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
    <div className="chat-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="chat-modal">
        <div className="chat-topbar">
          <div>
            <div className="chat-title">עוזר AI למערכת האנרגיה</div>
            <div className="chat-subtitle">שאל שאלות על צריכה, חריגות, מפסקים והשוואות</div>
          </div>
          <button onClick={onClose} className="chat-close">×</button>
        </div>
        <div className="chat-area" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble-wrap ${m.role}`}>
              <div className={`chat-bubble ${m.role}`}>{m.text}</div>
            </div>
          ))}
          {loading && (
            <div className="chat-bubble-wrap assistant">
              <div className="chat-bubble assistant chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>
        <div className="chat-input-wrap">
          <textarea
            className="chat-input"
            placeholder="כתוב שאלה..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
          />
          <button className="chat-send-btn" onClick={send} disabled={loading}>שלח</button>
        </div>
        <div className="chat-footer-note">התשובות מבוססות על הנתונים במערכת ועלולות לכלול הערכה.</div>
      </div>
    </div>
  );
}