const API_BASE = "";

// Logout helper
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
        // ignore
    }
    // Reload so server serves login page
    window.location.href = '/';
}
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

        }
    } catch (e) {
        window.alert('Unable to verify session. Please log in again.');
        logout();
    }
}

async function adjustUIForUserRole() {
    const userRole = await fetch(`${API_BASE}/api/me`);
    const userData = await userRole.json();
    return userData?.user?.role || "Expired";
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
    await checkAuth();
    highlightCurrentSeasonInBar();

    // Modal logic
    const btnSettings = document.getElementById('btn-settings');
    const modalOverlay = document.getElementById('tariff-modal-overlay');
    const btnClose = document.getElementById('tariff-modal-close');
    const tariffForm = document.getElementById('tariff-form');
    if (btnSettings) btnSettings.style.visibility = 'visible';

    // Ensure modal only opens on button click
    if (btnSettings && modalOverlay) {
        // Remove any accidental open state on load
        modalOverlay.classList.add('hidden');
        btnSettings.addEventListener('click', async function () {
            // בדיקת הרשאות (אם צריך)
            if (typeof adjustUIForUserRole === 'function') {
                const currentRole = await adjustUIForUserRole();
                if (currentRole !== 'admin') {
                    showAbbModal('Session Expired', 'Your session has expired or you do not have permission to access tariff settings. Please log in again.');
                    window.location.href = '/login';
                    return;
                }
            }
            // Fetch tariffs from server and populate form
            try {
                const resp = await fetch('/api/tariffs', { credentials: 'include' });
                if (!resp.ok) throw new Error('Failed to load tariffs');
                const data = await resp.json();
                if (data.tariffs && data.vat != null) {
                    document.getElementById('winter-off').value = data.tariffs.winter.off ?? '';
                    document.getElementById('winter-peak').value = data.tariffs.winter.peak ?? '';
                    document.getElementById('shoulder-off').value = data.tariffs.shoulder.off ?? '';
                    document.getElementById('shoulder-peak').value = data.tariffs.shoulder.peak ?? '';
                    document.getElementById('summer-off').value = data.tariffs.summer.off ?? '';
                    document.getElementById('summer-peak').value = data.tariffs.summer.peak ?? '';
                    document.getElementById('tariff-vat').value = data.vat ?? '';
                }
            } catch (err) {
                showAbbModal('Failed to load tariff rates from server.');
            }
            // Load values from localStorage (if any)
            const saved = localStorage.getItem('tariffData');
            if (saved) {
                try {
                    const tariffData = JSON.parse(saved);
                    if (tariffData.winter) {
                        document.getElementById('winter-off').value = tariffData.winter.off || '';
                        document.getElementById('winter-peak').value = tariffData.winter.peak || '';
                    }
                    if (tariffData.shoulder) {
                        document.getElementById('shoulder-off').value = tariffData.shoulder.off || '';
                        document.getElementById('shoulder-peak').value = tariffData.shoulder.peak || '';
                    }
                    if (tariffData.summer) {
                        document.getElementById('summer-off').value = tariffData.summer.off || '';
                        document.getElementById('summer-peak').value = tariffData.summer.peak || '';
                    }
                    if (tariffData.vat !== undefined) {
                        document.getElementById('tariff-vat').value = tariffData.vat || '';
                    }
                } catch (e) { }
            }
            modalOverlay.classList.remove('hidden');
        });
    }
    // Close modal
    if (btnClose && modalOverlay) {
        btnClose.addEventListener('click', function () {
            modalOverlay.classList.add('hidden');
        });
    }
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function (e) {
            if (e.target === modalOverlay) {
                modalOverlay.classList.add('hidden');
            }
        });
    }
    // Submit form
    if (tariffForm && modalOverlay) {
        tariffForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const tariffData = {
                winter: {
                    off: document.getElementById('winter-off').value,
                    peak: document.getElementById('winter-peak').value
                },
                shoulder: {
                    off: document.getElementById('shoulder-off').value,
                    peak: document.getElementById('shoulder-peak').value
                },
                summer: {
                    off: document.getElementById('summer-off').value,
                    peak: document.getElementById('summer-peak').value
                },
                vat: document.getElementById('tariff-vat').value
            };
            localStorage.setItem('tariffData', JSON.stringify(tariffData));
            try {
                const resp = await fetch('/api/change-tariffs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(tariffData)
                });
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    modalOverlay.classList.add('hidden');
                    showAbbModal('Failed to update tariffs', err.detail || 'Server error');
                    return;
                }
                modalOverlay.classList.add('hidden');
                showAbbModal('Tariff rates updated successfully!');
                if (typeof fillTariffSummaryBar === 'function') await fillTariffSummaryBar();
            } catch (err) {
                modalOverlay.classList.add('hidden');
                showAbbModal('Failed to update tariffs', err?.message || 'Network/server error');
                console.log(err.message);
            }
        });
    }
}





