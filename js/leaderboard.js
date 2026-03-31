/**
 * Leaderboard view -- team standings with expandable golfer details.
 */

const Leaderboard = (() => {
  const container = document.getElementById('view-leaderboard');

  function fmtVsPar(n) {
    if (n == null) return '-';
    if (n === 0) return 'E';
    return n > 0 ? `+${n}` : `${n}`;
  }

  function vsParClass(n) {
    if (n == null || n === 0) return '';
    return n < 0 ? 'under-par' : 'over-par';
  }

  function render(standings) {
    if (!standings || !standings.standings || standings.standings.length === 0) {
      container.innerHTML = '<div class="loading">No standings data yet. Check back once the tournament starts.</div>';
      return;
    }

    const currentRound = standings.current_round;
    const par = standings.par || 72;

    // ── Main standings table (unchanged) ──────────────────────────────────
    let html = `<table class="standings-table">
      <thead><tr>
        <th>Rank</th>
        <th>Team</th>
        <th>R1</th>
        <th>R2</th>
        <th>R3</th>
        <th>R4</th>
        <th title="Total holes remaining for counting golfers">Holes</th>
        <th>Total</th>
      </tr></thead>
      <tbody>`;

    standings.standings.forEach((team, idx) => {
      const behind = team.strokes_behind > 0 ? `+${team.strokes_behind}` : team.rank === 1 ? 'Leader' : 'E';
      const rt = team.round_totals || {};
      const holesLeft = team.holes_remaining != null ? team.holes_remaining : '-';

      html += `<tr class="team-row" data-team="${idx}">
        <td class="rank">${team.rank}</td>
        <td class="name"><span class="color-dot" style="background:${team.color}"></span>${team.name}</td>
        <td class="score-cell">${rt.R1 || '-'}</td>
        <td class="score-cell">${rt.R2 || '-'}</td>
        <td class="score-cell">${rt.R3 || '-'}</td>
        <td class="score-cell">${rt.R4 || '-'}</td>
        <td class="score-cell holes-cell">${holesLeft}</td>
        <td><span class="strokes">${team.total_strokes || '-'}</span> <span class="behind">${behind}</span></td>
      </tr>`;

      // Golfer detail rows
      html += `<tbody class="golfer-rows" id="golfers-${idx}">`;
      (team.golfers || []).forEach(g => {
        const isCounting = isGolferCounting(g, currentRound);
        const rowClass = isCounting ? 'counting' : 'not-counting';
        const cutBadge = g.current_pos === 'CUT' ? ' <span class="cut-badge">CUT</span>' : '';
        const pos = g.current_pos || '-';
        const thru = g.thru != null ? (g.thru === 18 ? 'F' : g.thru) : '-';
        const gHoles = g.holes_remaining != null ? g.holes_remaining : '-';

        html += `<tr class="golfer-row ${rowClass}">
          <td></td>
          <td class="golfer-name">${g.name}${cutBadge}</td>
          <td class="score-cell">${g.R1 != null ? g.R1 : '-'}</td>
          <td class="score-cell">${g.R2 != null ? g.R2 : '-'}</td>
          <td class="score-cell">${g.R3 != null ? g.R3 : '-'}</td>
          <td class="score-cell">${g.R4 != null ? g.R4 : '-'}</td>
          <td class="score-cell holes-cell">${gHoles}</td>
          <td class="pos-cell">${pos} ${thru !== '-' ? '(' + thru + ')' : ''}</td>
        </tr>`;
      });
      html += '</tbody>';
    });

    html += '</tbody></table>';

    // ── vs Par card ────────────────────────────────────────────────────────
    // Sort by vs_par (lowest = best) for the par board
    const parSorted = [...standings.standings].sort((a, b) => {
      const aP = a.vs_par ?? 9999;
      const bP = b.vs_par ?? 9999;
      return aP - bP;
    });

    const parLeader = parSorted[0]?.vs_par ?? null;

    html += `<div class="vs-par-card">
      <div class="vs-par-title">vs Par <span class="vs-par-subtitle">live team score relative to par</span></div>
      <div class="vs-par-grid">`;

    parSorted.forEach((team, i) => {
      const vp = team.vs_par;
      const vpDisplay = fmtVsPar(vp);
      const vpCls = vsParClass(vp);
      const vpBehind = i === 0 ? '' : (vp != null && parLeader != null ? `<span class="vp-behind">${fmtVsPar(vp - parLeader)}</span>` : '');

      const vpb = team.vs_par_by_round || {};
      const roundBreakdown = ['R1','R2','R3','R4']
        .filter(r => vpb[r] != null)
        .map(r => `<span class="vp-round">${r}: ${fmtVsPar(vpb[r])}</span>`)
        .join('');

      html += `<div class="vs-par-row">
        <span class="vp-rank">${i + 1}</span>
        <span class="vp-dot" style="background:${team.color}"></span>
        <span class="vp-name">${team.name}</span>
        <span class="vp-breakdown">${roundBreakdown}</span>
        <span class="vp-score ${vpCls}">${vpDisplay}</span>
        ${vpBehind}
      </div>`;
    });

    html += `</div></div>`;

    container.innerHTML = html;

    // Toggle golfer details
    container.querySelectorAll('.team-row').forEach(row => {
      row.addEventListener('click', () => {
        const teamIdx = row.dataset.team;
        document.getElementById(`golfers-${teamIdx}`).classList.toggle('open');
      });
    });
  }

  function isGolferCounting(golfer, currentRound) {
    if (!golfer.counting) return false;
    return Object.values(golfer.counting).some(v => v === true);
  }

  return { render };
})();
