/**
 * Main app -- hash router, data loading, auto-refresh.
 */

let appConfig = null;
let refreshTimer = null;

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function setActiveView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const view = document.getElementById(`view-${viewName}`);
  const link = document.querySelector(`.nav-link[data-view="${viewName}"]`);

  if (view) view.classList.add('active');
  if (link) link.classList.add('active');

  // Stop draft polling when leaving draft view
  if (viewName !== 'draft') {
    Draft.stopPolling();
  }
}

async function loadView(viewName) {
  setActiveView(viewName);

  switch (viewName) {
    case 'leaderboard':
      try {
        const standings = await API.getStandings();
        Leaderboard.render(standings);
        updateTimestamp(standings.last_updated);
      } catch (e) {
        document.getElementById('view-leaderboard').innerHTML =
          '<div class="loading">No standings data yet. Scores update every 5 minutes during the tournament.</div>';
      }
      break;

    case 'draft':
      Draft.init(appConfig);
      Draft.startPolling();
      break;

    case 'weekend':
      Weekend.init(appConfig);
      Weekend.refresh();
      break;

    case 'chart':
      StandingsChart.refresh(appConfig);
      break;
  }
}

function updateTimestamp(isoString) {
  const el = document.getElementById('last-updated');
  if (!el || !isoString) return;
  const d = new Date(isoString);
  el.textContent = `Last updated: ${d.toLocaleString()}`;
}

function getViewFromHash() {
  const hash = window.location.hash.replace('#', '') || 'leaderboard';
  return ['leaderboard', 'draft', 'weekend', 'chart'].includes(hash) ? hash : 'leaderboard';
}

// Auto-refresh leaderboard every 60 seconds
function startAutoRefresh() {
  refreshTimer = setInterval(async () => {
    const currentView = getViewFromHash();
    if (currentView === 'leaderboard') {
      try {
        const standings = await API.getStandings();
        Leaderboard.render(standings);
        updateTimestamp(standings.last_updated);
      } catch (e) { /* silent fail on auto-refresh */ }
    }
  }, 60000);
}

// Initialize
(async function main() {
  // Load config
  try {
    appConfig = await API.getConfig();
    await API.init();
  } catch (e) {
    console.warn('Config load failed:', e);
  }

  // Route
  const view = getViewFromHash();
  loadView(view);
  startAutoRefresh();

  // Hash change listener
  window.addEventListener('hashchange', () => {
    loadView(getViewFromHash());
  });
})();
