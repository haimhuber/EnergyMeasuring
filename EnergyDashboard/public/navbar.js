addEventListener('DOMContentLoaded', async function () {
    await loadNavbar();
}
);

// --- Tariff Summary Bar Fill ---
async function fillTariffSummaryBar() {
    try {
        const resp = await fetch('/api/tariffs', { credentials: 'include' });
        if (!resp.ok) throw new Error('Failed to load tariffs');
        const data = await resp.json();
        if (data.tariffs && data.vat != null) {
            // Winter
            document.querySelector('#tariff-winter .tariff-off').textContent = data.tariffs.winter.off;
            document.querySelector('#tariff-winter .tariff-peak').textContent = data.tariffs.winter.peak;
            // Shoulder
            document.querySelector('#tariff-shoulder .tariff-off').textContent = data.tariffs.shoulder.off;
            document.querySelector('#tariff-shoulder .tariff-peak').textContent = data.tariffs.shoulder.peak;
            // Summer
            document.querySelector('#tariff-summer .tariff-off').textContent = data.tariffs.summer.off;
            document.querySelector('#tariff-summer .tariff-peak').textContent = data.tariffs.summer.peak;
            // VAT
            // document.getElementById('tariff-vat-summary').textContent = data.vat;
        }
    } catch (err) {
        // fallback: show dashes
        document.querySelectorAll('.tariff-off, .tariff-peak').forEach(e => e.textContent = '-');
        // document.getElementById('tariff-vat-summary').textContent = '-';
    }
}

// --- Load cities for location input ---
async function loadCities() {

    try {

        const resp = await fetch("/api/cities");
        if (!resp.ok) throw new Error("Failed to load cities");

        const data = await resp.json();

        const datalist = document.getElementById("cities-list");
        data.cities.cities.city.forEach(city => {

            const name = city.english_name?.[0];
            if (!name) return;

            const option = document.createElement("option");
            option.value = name;

            datalist.appendChild(option);

        });

    } catch (err) {
        console.error("Error loading cities:", err);
    }

}


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
    const userRole = await fetch(`/api/me`);
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
    await fillTariffSummaryBar();
    await checkAuth();
    highlightCurrentSeasonInBar();
    await loadCities();
    await currentLocation();
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
            // Check user role before allowing access to settings
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

            // fetch location from server and populate location field
            // try {
            //     const resp = await fetch('/api/location', { credentials: 'include' });
            //     if (!resp.ok) throw new Error('Failed to load location');
            //     const data = await resp.json();
            //     if (data.location && data.location.length > 0) {
            //         document.getElementById("nav-location").addEventListener("input", (e) => {
            //             const location = e.target.value;
            //         });
            //     }
            // } catch (err) {
            //     console.error('Error fetching location:', err);
            // }

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
            const location = document.getElementById('nav-location').value;
            if (location) {
                localStorage.setItem('location', location);
            }
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
                if (typeof fillTariffSummaryBar === 'function') await fillTariffSummaryBar();
            } catch (err) {
                modalOverlay.classList.add('hidden');
                showAbbModal('Failed to update tariffs', err?.message || 'Network/server error');
                console.log(err.message);
            }
            try {

                const location = document.getElementById("nav-location").value;

                await fetch('/api/update-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ location })
                });

                modalOverlay.classList.add('hidden');

                showAbbModal('Settings updated successfully!');

                if (typeof currentLocation === 'function') {
                    await currentLocation();
                }

            } catch (err) {
                console.error('Error updating location:', err);
            }
        });
    }
}

// --- ChatGPT Modal Integration ---
// Ensure chatgpt-modal.js is loaded in your HTML!
document.addEventListener('DOMContentLoaded', function () {
    const chatBtn = document.getElementById('btn-chatgpt');
    if (chatBtn && typeof createChatGptModal === 'function') {
        chatBtn.addEventListener('click', createChatGptModal);
    }
});


function currentHour() {
    const now = new Date();
    const displayTime = now.toLocaleTimeString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('nav-time').textContent = displayTime;
    setTimeout(currentHour, 60000); // Update every minute
}

async function currentLocation() {
    // get location from server and display in navbar
    try {
        const resp = await fetch('/api/location', { credentials: 'include' });
        if (!resp.ok) throw new Error('Failed to load location');
        const data = await resp.json();
        if (data.location && data.location.length > 0) {
            document.getElementById('navbar-location').textContent = data.location[0].LocationName || 'Unknown';
            document.getElementById('nav-location').value = data.location[0].LocationName || 'Unknown';
        }
    } catch (err) {
        console.error('Error fetching location:', err);
        const locationElements = document.getElementById('navbar-location');
    }
}



async function loadNavbar() {
    const res = await fetch('navbar.html');
    const html = await res.text();
    document.getElementById('navbar-container').innerHTML = html;
    await iniitializeNavbar();
    currentHour();
    await currentLocation();

}







