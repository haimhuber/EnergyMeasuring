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

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();


    const list = document.getElementById('analyze-breakers-list');

    function formatNumber(value) {
        const num = Number(value || 0);
        return `${num.toFixed(2)} kWh`;
    }

    function formatHourLabel(hourOfDay) {
        return `${String(hourOfDay).padStart(2, '0')}:00`;
    }

    function renderBreakers(breakers) {
        if (!breakers.length) {
            list.innerHTML = `<div class="breaker-card"><h2>No data available</h2></div>`;
            return;
        }

        list.innerHTML = breakers.map((b, idx) => `
    <div class="breaker-card">
        <h2>${b.BreakerName}</h2>

        <div class="breaker-data">
            <div>Last Hourly Consumption: <span>${formatNumber(b.LastHourConsumption)}</span></div>
            <div>Total Daily Energy: <span>${formatNumber(b.DailyTotalConsumption)}</span></div>
        </div>

            <div class="breaker-table-section">
            <div class="breaker-table-title">Hourly Consumption (kWh)</div>
            <div class="chart-wrap">
                <canvas id="breaker-chart-${idx}"></canvas>
            </div>
            </div>
            </div>
            `).join('');

        breakers.forEach((b, idx) => {
            const ctx = document.getElementById(`breaker-chart-${idx}`);
            if (!ctx || !window.Chart) return;

            const labels = (b.hourlyData || []).map(h => formatHourLabel(h.HourOfDay));
            const data = (b.hourlyData || []).map(h => Number(h.HourlyConsumption || 0));

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Hourly Consumption',
                        data,
                        borderColor: '#ff416c',
                        backgroundColor: 'rgba(255,65,108,0.12)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 4,
                        pointBackgroundColor: '#ff416c',
                        pointBorderColor: '#fff',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                color: '#ffe7a0',
                                font: { weight: 600 },
                                callback: function (value, index) {
                                    return index % 3 === 0 ? this.getLabelForValue(value) : '';
                                }
                            },
                            title: {
                                display: true,
                                text: 'Hour',
                                color: '#ffe7a0'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255,255,255,0.08)' },
                            ticks: {
                                color: '#ffe7a0',
                                font: { weight: 600 }
                            },
                            title: {
                                display: true,
                                text: 'kWh',
                                color: '#ffe7a0'
                            }
                        }
                    }
                }
            });
        });
    }

    try {
        list.innerHTML = `<div class="breaker-card"><h2>Loading...</h2></div>`;

        const response = await fetch('/api/breakers/consumption');
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();

        const summary = data.summary || [];
        const hourly = data.hourly || [];

        const breakers = summary.map(breaker => ({
            ...breaker,
            hourlyData: hourly
                .filter(h => h.BreakerId === breaker.BreakerId)
                .sort((a, b) => a.HourOfDay - b.HourOfDay)
        }));

        renderBreakers(breakers);
    } catch (err) {
        console.error('Error loading breaker analysis data:', err);
        list.innerHTML = `
            <div class="breaker-card">
                <h2>Failed to load data</h2>
                <div class="breaker-data">
                    <div>Please try again later.</div>
                </div>
            </div>
        `;
    }
});