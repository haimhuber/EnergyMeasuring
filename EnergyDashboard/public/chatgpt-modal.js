// ChatGPT Modal Logic
// Add <script src="chatgpt-modal.js"></script> to your HTML
// Add a button with id="btn-chatgpt" to open the modal

function createChatGptModal() {
    if (document.getElementById('chatgpt-modal-overlay')) return; // Prevent duplicates
    const overlay = document.createElement('div');
    overlay.id = 'chatgpt-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = 9999;

    const modal = document.createElement('div');
    modal.style.background = '#773030';
    modal.style.padding = '24px 20px 16px 20px';
    modal.style.borderRadius = '12px';
    modal.style.boxShadow = '0 2px 16px rgba(0,0,0,0.13)';
    modal.style.minWidth = '340px';
    modal.style.maxWidth = '95vw';
    modal.style.maxHeight = '80vh';
    modal.style.overflowY = 'auto';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';

    const header = document.createElement('div');
    header.textContent = 'Chat with ChatGPT';
    header.style.fontWeight = 'bold';
    header.style.fontSize = '18px';
    header.style.marginBottom = '10px';
    modal.appendChild(header);

    const chatArea = document.createElement('div');
    chatArea.id = 'chatgpt-chat-area';
    chatArea.style.background = '#030303';
    chatArea.style.border = '1px solid #eee';
    chatArea.style.borderRadius = '8px';
    chatArea.style.padding = '10px';
    chatArea.style.height = '220px';
    chatArea.style.overflowY = 'auto';
    chatArea.style.marginBottom = '12px';
    modal.appendChild(chatArea);

    const inputRow = document.createElement('div');
    inputRow.style.display = 'flex';
    inputRow.style.gap = '8px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type your question...';
    input.style.flex = '1';
    input.style.padding = '8px';
    input.style.borderRadius = '6px';
    input.style.border = '1px solid #ccc';
    inputRow.appendChild(input);

    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send';
    sendBtn.style.padding = '8px 16px';
    sendBtn.style.borderRadius = '6px';
    sendBtn.style.background = '#8f1e26';
    sendBtn.style.color = '#fff';
    sendBtn.style.border = 'none';
    sendBtn.style.fontWeight = 'bold';
    sendBtn.style.cursor = 'pointer';
    inputRow.appendChild(sendBtn);

    modal.appendChild(inputRow);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.marginTop = '10px';
    closeBtn.style.alignSelf = 'flex-end';
    closeBtn.style.background = '#eee';
    closeBtn.style.color = '#222';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '6px';
    closeBtn.style.padding = '6px 16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => overlay.remove();
    modal.appendChild(closeBtn);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Send logic (replace with real API call)
    sendBtn.onclick = async function () {
        const question = input.value.trim();
        if (!question) return;
        appendMessage('You', question);
        input.value = '';
        chatArea.scrollTop = chatArea.scrollHeight;
        // Simulate API call
        appendMessage('ChatGPT', '...thinking...');
        setTimeout(() => {
            chatArea.lastChild.textContent = 'ChatGPT: (הכנס כאן קריאה ל-API שלך)';
        }, 1200);
    };
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') sendBtn.onclick();
    });

    function appendMessage(sender, text) {
        const msg = document.createElement('div');
        msg.textContent = sender + ': ' + text;
        msg.style.marginBottom = '6px';
        msg.style.whiteSpace = 'pre-line';
        chatArea.appendChild(msg);
        chatArea.scrollTop = chatArea.scrollHeight;
    }
}

// Add event listener to open modal from navbar button
window.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('btn-chatgpt');
    if (btn) btn.addEventListener('click', createChatGptModal);
});
