/**
 * Weekend team selector view.
 */

const Weekend = (() => {
  const container = document.getElementById('view-weekend');
  let config = null;
  let selections = {}; // {owner: Set of dg_ids}

  function init(cfg) {
    config = cfg;
  }

  async function refresh() {
    try {
      const [standings, weekendState] = await Promise.all([
        API.getStandings().catch(() => null),
        API.getWeekendState().catch(() => ({ weekend_teams: {} })),
      ]);
      render(standings, weekendState);
    } catch (e) {
      container.innerHTML = `<div class="loading">Weekend picks not available yet.</div>`;
    }
  }

  function render(standings, weekendState) {
    if (!standings || !standings.standings || standings.standings.length === 0) {
      container.innerHTML = '<div class="loading">Standings data needed for weekend picks. Check back after R2.</div>';
      return;
    }

    const existingPicks = weekendState.weekend_teams || {};
    let html = '<div class="weekend-grid">';

    standings.standings.forEach(team => {
      const color = team.color || '#333';
      const isLocked = existingPicks[team.name] && existingPicks[team.name].length === 4;
      const lockedIds = new Set(existingPicks[team.name] || []);

      // Initialize selections if not set
      if (!selections[team.name]) {
        selections[team.name] = new Set(lockedIds);
      }

      html += `<div class="weekend-card">`;
      html += `<div class="weekend-card-header" style="background:${color}">${team.name}</div>`;

      (team.golfers || []).forEach(g => {
        const madeCut = g.make_cut > 0 || g.current_pos !== 'CUT';
        const missedCut = g.current_pos === 'CUT';
        const rowClass = missedCut ? 'missed-cut' : '';
        const isSelected = selections[team.name].has(g.dg_id) || lockedIds.has(g.dg_id);
        const checked = isSelected ? ' checked' : '';
        const disabled = missedCut || isLocked ? ' disabled' : '';
        const statusText = missedCut ? 'MC' : (g.current_pos || '');

        html += `<div class="weekend-golfer ${rowClass}">
          <input type="checkbox" data-owner="${team.name}" data-dgid="${g.dg_id}" ${checked} ${disabled}>
          <span>${g.name}</span>
          <span class="golfer-status">${statusText}</span>
        </div>`;
      });

      if (isLocked) {
        html += '<div class="weekend-locked">Weekend team locked</div>';
      } else {
        const selCount = selections[team.name] ? selections[team.name].size : 0;
        html += `<button class="weekend-submit" data-owner="${team.name}" ${selCount !== 4 ? 'disabled' : ''}>
          Submit Weekend Team (${selCount}/4)
        </button>`;
      }

      html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;

    // Checkbox listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const owner = cb.dataset.owner;
        const dgId = parseInt(cb.dataset.dgid);
        if (!selections[owner]) selections[owner] = new Set();

        if (cb.checked) {
          if (selections[owner].size >= 4) {
            cb.checked = false;
            showToast('Maximum 4 golfers for weekend team');
            return;
          }
          selections[owner].add(dgId);
        } else {
          selections[owner].delete(dgId);
        }

        // Update submit button
        const btn = container.querySelector(`button[data-owner="${owner}"]`);
        if (btn) {
          btn.disabled = selections[owner].size !== 4;
          btn.textContent = `Submit Weekend Team (${selections[owner].size}/4)`;
        }
      });
    });

    // Submit listeners
    container.querySelectorAll('.weekend-submit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const owner = btn.dataset.owner;
        const ids = Array.from(selections[owner]);
        btn.disabled = true;
        btn.textContent = 'Submitting...';

        try {
          const result = await API.makeWeekendPick(owner, ids);
          if (result.error) {
            showToast(result.error);
          } else {
            showToast(`${owner}'s weekend team submitted!`);
          }
          refresh();
        } catch (err) {
          showToast('Error: ' + err.message);
          refresh();
        }
      });
    });
  }

  return { init, refresh };
})();
