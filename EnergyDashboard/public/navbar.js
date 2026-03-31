async function checkAuth() {
    try {
        const response = await fetch('/api/me', { credentials: 'include' });
        const data = await response.json();
        if (!data.ok) {
            window.alert('Session expired. Please log in again.');
            logout();
        } else {
            const userName = document.getElementById('nav-username');
            userName.textContent = data.user.username;
            console.log(userName);

        }
    } catch (e) {
        window.alert('Unable to verify session. Please log in again.');
        logout();
    }
}

// --- Highlight current season in summary bar ---
function highlightCurrentSeasonInBar() {
    // Remove previous highlight
    document.querySelectorAll('.tariff-season').forEach(el => el.classList.remove('current-season'));
    // Determine current season
    const now = new Date();
    const m = now.getMonth() + 1;
    let season = 'shoulder';
    if (m === 12 || m === 1 || m === 2) season = 'winter';
    else if (m >= 6 && m <= 9) season = 'summer';
    // Highlight
    const el = document.getElementById('tariff-' + season);
    if (el) el.classList.add('current-season');
}

async function iniitializeNavbar() {
    // Check auth and update username
    await checkAuth();
    // Highlight current season in summary bar
    highlightCurrentSeasonInBar();
}





