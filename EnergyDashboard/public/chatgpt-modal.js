// ChatGPT Modal Logic
// Add <script src="chatgpt-modal.js"></script> to your HTML
// Add a button with id="btn-chatgpt" to open the modal

function createChatGptModal() {
    if (document.getElementById('chatgpt-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'chatgpt-modal-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '9999',
        padding: '20px',
        boxSizing: 'border-box'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
        width: '100%',
        maxWidth: '520px',
        height: 'min(78vh, 720px)',
        background: 'linear-gradient(180deg, #1b1d22 0%, #121317 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        direction: 'rtl',
        textAlign: 'right',
        fontFamily: 'Segoe UI, Arial, sans-serif'
    });

    const topBar = document.createElement('div');
    Object.assign(topBar.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)'
    });

    const titleWrap = document.createElement('div');
    Object.assign(titleWrap.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    });

    const title = document.createElement('div');
    title.textContent = 'עוזר AI למערכת האנרגיה';
    Object.assign(title.style, {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: '18px'
    });

    const subtitle = document.createElement('div');
    subtitle.textContent = 'שאל שאלות על צריכה, חריגות, מפסקים והשוואות';
    Object.assign(subtitle.style, {
        color: 'rgba(255,255,255,0.65)',
        fontSize: '12px'
    });

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const headerCloseBtn = document.createElement('button');
    headerCloseBtn.innerHTML = '&times;';
    Object.assign(headerCloseBtn.style, {
        width: '36px',
        height: '36px',
        borderRadius: '10px',
        border: 'none',
        background: 'rgba(255,255,255,0.08)',
        color: '#fff',
        fontSize: '22px',
        cursor: 'pointer',
        transition: '0.2s ease'
    });
    headerCloseBtn.onmouseenter = () => {
        headerCloseBtn.style.background = 'rgba(255,255,255,0.16)';
    };
    headerCloseBtn.onmouseleave = () => {
        headerCloseBtn.style.background = 'rgba(255,255,255,0.08)';
    };
    headerCloseBtn.onclick = () => overlay.remove();

    topBar.appendChild(titleWrap);
    topBar.appendChild(headerCloseBtn);

    const chatArea = document.createElement('div');
    chatArea.id = 'chatgpt-chat-area';
    Object.assign(chatArea.style, {
        flex: '1',
        overflowY: 'auto',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'radial-gradient(circle at top, rgba(143,30,38,0.10), transparent 30%), #101114'
    });

    const welcomeMsg = createBubble(
        'assistant',
        'שלום, אני כאן כדי לעזור לך לנתח את נתוני האנרגיה שלך. אפשר לשאול למשל:\n• איזה מפסק צרך הכי הרבה השבוע?\n• האם היו פיקים חריגים?\n• מה הייתה הצריכה הגבוהה ביותר אתמול?'
    );
    chatArea.appendChild(welcomeMsg);

    const inputWrap = document.createElement('div');
    Object.assign(inputWrap.style, {
        padding: '14px 16px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: '#14161a'
    });

    const inputRow = document.createElement('div');
    Object.assign(inputRow.style, {
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-end'
    });

    const input = document.createElement('textarea');
    input.placeholder = 'כתוב שאלה...';
    input.rows = 1;
    Object.assign(input.style, {
        flex: '1',
        resize: 'none',
        minHeight: '46px',
        maxHeight: '120px',
        padding: '12px 14px',
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.1)',
        background: '#0f1013',
        color: '#fff',
        outline: 'none',
        fontSize: '14px',
        lineHeight: '1.5',
        boxSizing: 'border-box'
    });

    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'שלח';
    Object.assign(sendBtn.style, {
        minWidth: '88px',
        height: '46px',
        borderRadius: '14px',
        border: 'none',
        background: 'linear-gradient(135deg, #b3202a 0%, #8f1e26 100%)',
        color: '#fff',
        fontWeight: '700',
        fontSize: '14px',
        cursor: 'pointer',
        boxShadow: '0 8px 22px rgba(143,30,38,0.35)',
        transition: '0.2s ease'
    });
    sendBtn.onmouseenter = () => {
        sendBtn.style.transform = 'translateY(-1px)';
        sendBtn.style.boxShadow = '0 12px 28px rgba(143,30,38,0.45)';
    };
    sendBtn.onmouseleave = () => {
        sendBtn.style.transform = 'translateY(0)';
        sendBtn.style.boxShadow = '0 8px 22px rgba(143,30,38,0.35)';
    };

    const footerNote = document.createElement('div');
    footerNote.textContent = 'התשובות מבוססות על הנתונים במערכת ועלולות לכלול הערכה.';
    Object.assign(footerNote.style, {
        marginTop: '10px',
        color: 'rgba(255,255,255,0.45)',
        fontSize: '11px',
        textAlign: 'right'
    });

    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    inputWrap.appendChild(inputRow);
    inputWrap.appendChild(footerNote);

    modal.appendChild(topBar);
    modal.appendChild(chatArea);
    modal.appendChild(inputWrap);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    input.focus();

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
    });

    function autoResizeTextarea(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    input.addEventListener('input', function () {
        autoResizeTextarea(input);
    });

    sendBtn.onclick = async function () {
        const question = input.value.trim();
        if (!question) return;

        chatArea.appendChild(createBubble('user', question));
        input.value = '';
        autoResizeTextarea(input);

        const thinkingBubble = createTypingBubble();
        chatArea.appendChild(thinkingBubble);
        scrollToBottom();

        sendBtn.disabled = true;
        input.disabled = true;
        sendBtn.style.opacity = '0.7';
        sendBtn.style.cursor = 'not-allowed';

        try {
            const response = await fetch('/api/ai-query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ question })
            });

            const data = await response.json();

            thinkingBubble.remove();

            if (!response.ok) {
                chatArea.appendChild(
                    createBubble('assistant', data.detail || data.error || 'אירעה שגיאה בשרת.')
                );
                scrollToBottom();
                return;
            }

            chatArea.appendChild(
                createBubble('assistant', data.answer || 'לא התקבלה תשובה.')
            );
        } catch (error) {
            console.error('Request error:', error);
            thinkingBubble.remove();
            chatArea.appendChild(
                createBubble('assistant', 'לא ניתן היה להתחבר לשרת. בדוק שהשרת פעיל ונסה שוב.')
            );
        } finally {
            sendBtn.disabled = false;
            input.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
            input.focus();
            scrollToBottom();
        }
    };

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.onclick();
        }
    });

    function createBubble(type, text) {
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
            display: 'flex',
            justifyContent: type === 'user' ? 'flex-start' : 'flex-end'
        });

        const bubble = document.createElement('div');
        bubble.textContent = text;

        Object.assign(bubble.style, {
            maxWidth: '82%',
            padding: '12px 14px',
            borderRadius: '16px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '14px',
            lineHeight: '1.55',
            direction: 'rtl',
            textAlign: 'right',
            boxSizing: 'border-box'
        });

        if (type === 'user') {
            Object.assign(bubble.style, {
                background: 'linear-gradient(135deg, #8f1e26 0%, #6f1820 100%)',
                color: '#fff',
                borderBottomLeftRadius: '6px',
                boxShadow: '0 10px 24px rgba(143,30,38,0.22)'
            });
        } else {
            Object.assign(bubble.style, {
                background: '#1d2128',
                color: '#f1f3f5',
                border: '1px solid rgba(255,255,255,0.06)',
                borderBottomRightRadius: '6px'
            });
        }

        wrapper.appendChild(bubble);
        return wrapper;
    }

    function createTypingBubble() {
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
            display: 'flex',
            justifyContent: 'flex-end'
        });

        const bubble = document.createElement('div');
        Object.assign(bubble.style, {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#1d2128',
            color: '#f1f3f5',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px',
            borderBottomRightRadius: '6px',
            padding: '12px 14px'
        });

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            Object.assign(dot.style, {
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.7)',
                display: 'inline-block',
                animation: `chatgptTyping 1.2s ${i * 0.2}s infinite ease-in-out`
            });
            bubble.appendChild(dot);
        }

        if (!document.getElementById('chatgpt-typing-style')) {
            const style = document.createElement('style');
            style.id = 'chatgpt-typing-style';
            style.textContent = `
                @keyframes chatgptTyping {
                    0%, 80%, 100% { transform: scale(0.7); opacity: 0.45; }
                    40% { transform: scale(1); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        wrapper.appendChild(bubble);
        return wrapper;
    }

    function scrollToBottom() {
        chatArea.scrollTop = chatArea.scrollHeight;
    }
}

window.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('btn-chatgpt');
    if (btn) btn.addEventListener('click', createChatGptModal);
});