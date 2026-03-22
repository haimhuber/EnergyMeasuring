// analyze.js
// This script will render breaker cards with last hourly and daily energy data
// Placeholder for now

document.addEventListener('DOMContentLoaded', () => {
    const breakers = [
        {
            name: 'Breaker 1',
            lastHourly: '2.1 kWh',
            totalDaily: '18.7 kWh',
            hourly: [1.2, 1.5, 2.1, 2.0, 1.8, 2.3, 2.1, 2.0]
        },
        {
            name: 'Breaker 2',
            lastHourly: '1.7 kWh',
            totalDaily: '15.2 kWh',
            hourly: [1.0, 1.3, 1.7, 1.6, 1.5, 2.0, 2.1, 2.0]
        },
        {
            name: 'Breaker 3',
            lastHourly: '2.5 kWh',
            totalDaily: '20.1 kWh',
            hourly: [1.5, 1.8, 2.5, 2.3, 2.2, 2.7, 2.5, 2.6]
        }
    ];

    const list = document.getElementById('analyze-breakers-list');
    list.innerHTML = breakers.map((b, idx) => `
      <div class="breaker-card">
        <h2>${b.name}</h2>
        <div class="breaker-data">
          <div>Last Hourly Consumption: <span>${b.lastHourly}</span></div>
          <div>Total Daily Energy: <span>${b.totalDaily}</span></div>
        </div>
        <div class="breaker-table-section">
          <div class="breaker-table-title">Hourly Consumption (kWh)</div>
          <table class="breaker-table">
          </table>
          <canvas id="breaker-chart-${idx}" width="320" height="120" style="margin-top:12px;"></canvas>
        </div>
      </div>
    `).join('');

    // Render Chart.js charts for each breaker
    breakers.forEach((b, idx) => {
        const ctx = document.getElementById(`breaker-chart-${idx}`);
        if (ctx && window.Chart) {
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: b.hourly.map((_, i) => `Hour ${i + 1}`),
                    datasets: [{
                        label: 'Hourly Consumption',
                        data: b.hourly,
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
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: '#ffe7a0', font: { weight: 600 } }
                        },
                        y: {
                            grid: { color: 'rgba(255,255,255,0.08)' },
                            ticks: { color: '#ffe7a0', font: { weight: 600 } }
                        }
                    }
                }
            });
        }
    });
});
