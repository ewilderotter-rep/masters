/**
 * Running standings chart view.
 */

const StandingsChart = (() => {
  let chartInstance = null;

  async function refresh(config) {
    try {
      const history = await API.getHistory();
      render(history, config);
    } catch (e) {
      const container = document.getElementById('view-chart');
      container.innerHTML = '<div class="loading">No chart data yet. Scores will populate during the tournament.</div><canvas id="standings-chart" style="display:none"></canvas>';
    }
  }

  function render(history, config) {
    if (!history || history.length === 0) {
      return;
    }

    const canvas = document.getElementById('standings-chart');
    if (!canvas) return;
    canvas.style.display = '';

    const participants = config ? Object.keys(config.participants) : [];
    const colors = config ? config.participants : {};

    // Build datasets
    const labels = history.map((_, i) => i + 1);
    const datasets = participants.map(name => ({
      label: name,
      data: history.map(h => h.scores[name] || null),
      borderColor: colors[name] ? colors[name].color : '#333',
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2.5,
    }));

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              font: { family: 'Georgia, serif', size: 13 },
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.raw} strokes`,
            },
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Total Strokes',
              font: { family: 'Georgia, serif' },
            },
            reverse: false,
          },
          x: {
            title: {
              display: true,
              text: 'Update',
              font: { family: 'Georgia, serif' },
            },
          },
        },
      },
    });
  }

  return { refresh };
})();
