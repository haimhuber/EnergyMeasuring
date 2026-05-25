export default function AbbModal({ title, message, onClose }) {
  if (!title && !message) return null;
  return (
    <div className="abb-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="abb-modal" role="dialog" aria-modal="true">
        <div className="abb-modal-topbar" />
        <div className="abb-modal-header">
          <div className="abb-modal-brand">
            <span className="abb-modal-brand-text">ABB</span>
            <span className="abb-modal-system-text">Energy Monitoring System</span>
          </div>
          <button onClick={onClose} className="abb-modal-close">×</button>
        </div>
        <div className="abb-modal-body">
          <div className="abb-modal-icon-wrap"><div className="abb-modal-icon">!</div></div>
          <div className="abb-modal-content">
            <h3 className="abb-modal-title">{title}</h3>
            <p className="abb-modal-message">{message}</p>
          </div>
        </div>
        <div className="abb-modal-footer">
          <button onClick={onClose} className="abb-btn-primary">OK</button>
        </div>
      </div>
    </div>
  );
}