/**
 * Leaderboard view -- team standings with expandable golfer details.
 */

const Leaderboard = (() => {
  const container = document.getElementById('view-leaderboard');

  function render(standings) {
    if (!standings || !standings.standings || standings.standings.length === 0) {
      container.innerHTML = '<div class="loading">No standings data yet. Check back once the tournament starts.</div>';
      return;
    }

    const currentRound = standings.current_round;
    const par = standings.par || 72;

    let html = `<table class="standings-table">
      <thead><tr>
        <th>Rank</th>
        <th>Team</th>
        <th>R1</th>
        <th>R2</th>
        <th>R3</th>
        <th>R4</th>
        <th>Total</th>
      </tr></thead>
      <tbody>`;

    standings.standings.forEach((team, idx) => {
      const behind = team.strokes_behind > 0 ? `+${team.strokes_behind}` : team.rank === 1 ? 'Leader' : 'E';
      const rt = team.round_totals || {};

      html += `<tr class="team-row" data-team="${idx}">
        <td class="rank">${team.rank}</td>
        <td class="name"><span class="color-dot" style="background:${team.color}"></span>${team.name}</td>
        <td class="score-cell">${rt.R1 || '-'}</td>
        <td class="score-cell">${rt.R2 || '-'}</td>
        <td class="score-cell">${rt.R3 || '-'}</td>
        <td class="score-cell">${rt.R4 || '-'}</td>
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

        html += `<tr class="golfer-row ${rowClass}">
          <td></td>
          <td class="golfer-name">${g.name}${cutBadge}</td>
          <td class="score-cell">${g.R1 != null ? g.R1 : '-'}</td>
          <td class="score-cell">${g.R2 != null ? g.R2 : '-'}</td>
          <td class="score-cell">${g.R3 != null ? g.R3 : '-'}</td>
          <td class="score-cell">${g.R4 != null ? g.R4 : '-'}</td>
          <td class="pos-cell">${pos} ${thru !== '-' ? '(' + thru + ')' : ''}</td>
        </tr>`;
      });
      html += '</tbody>';
    });

    html += '</tbody></table>';
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
    // A golfer is "counting" if they count in any round
    return Object.values(golfer.counting).some(v => v === true);
  }

  return { render };
})();
