/**
 * Live snake draft view.
 */

const Draft = (() => {
  const container = document.getElementById('view-draft');
  let currentIdentity = null;
  let pollTimer = null;
  let config = null;

  async function init(cfg) {
    config = cfg;
  }

  function startPolling() {
    if (pollTimer) return;
    refresh();
    pollTimer = setInterval(refresh, 4000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function refresh() {
    try {
      const [draftState, fieldState] = await Promise.all([
        API.getDraftState(),
        API.getAvailableField(),
      ]);
      render(draftState, fieldState);
    } catch (e) {
      // If Apps Script isn't configured, show setup message
      container.innerHTML = `<div class="loading">
        Draft not available yet. Apps Script URL needs to be configured.
        <br><br><small>${e.message}</small>
      </div>`;
    }
  }

  function render(draftState, fieldState) {
    const participants = config ? Object.keys(config.participants) : ['Corey', 'Eli', 'Preston', 'Eric'];
    const colors = config ? config.participants : {};
    const isActive = draftState.status === 'active';
    const isComplete = draftState.status === 'complete';
    const onClock = draftState.on_the_clock;
    const canPick = isActive && currentIdentity === onClock;

    let html = '';

    // Draft header
    html += '<div class="draft-header">';
    if (isComplete) {
      html += '<div class="on-the-clock" style="color: var(--masters-green)">Draft Complete</div>';
      html += `<div class="pick-info">${draftState.total_picks} picks made</div>`;
    } else if (isActive) {
      const clockColor = colors[onClock] ? colors[onClock].color : 'var(--masters-green)';
      html += `<div class="draft-status">Round ${draftState.current_round} &middot; Pick ${draftState.current_pick} of ${draftState.total_picks}</div>`;
      html += `<div class="on-the-clock" style="color:${clockColor}">On the Clock: ${onClock}</div>`;
    } else {
      html += '<div class="on-the-clock">Draft Not Started</div>';
      html += '<div class="pick-info">Waiting for commissioner to start the draft</div>';
    }

    // Identity selector
    html += '<div class="identity-bar">';
    html += '<label>I am:</label>';
    html += '<select id="identity-select">';
    html += '<option value="">-- Select --</option>';
    participants.forEach(p => {
      const sel = currentIdentity === p ? ' selected' : '';
      html += `<option value="${p}"${sel}>${p}</option>`;
    });
    html += '</select></div>';
    html += '</div>';

    // Draft content: available players + board
    html += '<div class="draft-content">';

    // Available players
    html += '<div class="available-panel">';
    html += '<div class="panel-title">Available Players</div>';
    html += '<div class="search-box"><input type="text" id="player-search" placeholder="Search players..."></div>';
    html += '<ul class="player-list" id="player-list">';

    const available = (fieldState && fieldState.available) || [];
    available.forEach(p => {
      const rankText = p.dg_rank ? `#${p.dg_rank}` : '';
      const disabled = !canPick ? ' disabled' : '';
      html += `<li class="${disabled ? 'disabled' : ''}" data-name="${p.name.toLowerCase()}" data-dgid="${p.dg_id}">
        <span>${p.name} <span class="rank-badge">${rankText}</span></span>
        ${canPick ? `<button class="pick-btn" data-dgid="${p.dg_id}" data-name="${p.name}">Pick</button>` : ''}
      </li>`;
    });

    html += '</ul></div>';

    // Draft board
    html += '<div class="board-panel">';
    html += '<div class="panel-title">Draft Board</div>';
    html += '<div class="draft-board"><div class="draft-board-grid">';

    // Build pick map
    const picksByOwner = {};
    participants.forEach(p => picksByOwner[p] = []);
    (draftState.picks || []).forEach(pick => {
      if (picksByOwner[pick.team_owner]) {
        picksByOwner[pick.team_owner].push(pick);
      }
    });

    participants.forEach(p => {
      const color = colors[p] ? colors[p].color : '#333';
      html += `<div class="draft-column">`;
      html += `<h4 style="background:${color}">${p}</h4>`;
      for (let i = 0; i < 8; i++) {
        const pick = picksByOwner[p][i];
        if (pick) {
          html += `<div class="draft-slot filled"><span class="pick-num">${pick.pick_number}.</span> ${pick.player_name}</div>`;
        } else {
          html += `<div class="draft-slot"></div>`;
        }
      }
      html += '</div>';
    });

    html += '</div></div></div>';
    html += '</div>';

    container.innerHTML = html;

    // Event listeners
    document.getElementById('identity-select').addEventListener('change', (e) => {
      currentIdentity = e.target.value || null;
      refresh();
    });

    document.getElementById('player-search').addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll('#player-list li').forEach(li => {
        li.style.display = li.dataset.name.includes(query) ? '' : 'none';
      });
    });

    // Pick buttons
    container.querySelectorAll('.pick-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dgId = parseInt(btn.dataset.dgid);
        const name = btn.dataset.name;
        btn.disabled = true;
        btn.textContent = '...';

        try {
          const result = await API.makePick(currentIdentity, name, dgId);
          if (result.error) {
            showToast(result.error);
          } else {
            showToast(`${name} drafted by ${currentIdentity}!`);
          }
          refresh();
        } catch (err) {
          showToast('Error: ' + err.message);
          refresh();
        }
      });
    });
  }

  return { init, startPolling, stopPolling, refresh };
})();
