(() => {
  const league = window.espnLeagueData;
  const history = Array.isArray(window.espnHistoryData) ? window.espnHistoryData : [];
  const prediction = window.espnForecastData && Number(window.espnForecastData.leagueId) === Number(league?.leagueId) && Number(window.espnForecastData.week) === Number(league?.currentWeek) ? window.espnForecastData : null;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const format = (value, digits = 1) => Number(value || 0).toLocaleString(undefined, {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const formatAllPlay = value => format(value, Number.isInteger(value) ? 0 : 1);
  const colors = ['#c45b38','#735cc8','#3e8b84','#de8a38','#477eb2','#b95b82','#597b49','#bd715a','#687d9c','#9b845a','#8b6ab0','#479bad'];
  const currentWeek = Number(league?.currentWeek) || 1;
  const completedWeeks = Math.max(0, currentWeek - 1);
  const teams = (league?.teams || []).map((team, index) => ({...team, color: colors[index % colors.length], abbreviation: (team.abbr || team.name.split(/\s+/).map(word => word[0]).join('')).slice(0, 3).toUpperCase()}));
  const teamById = new Map(teams.map(team => [Number(team.id), team]));
  teams.forEach(team => team.titleChance = prediction?.teams?.[team.id]?.titleChance ?? null);
  const ranked = [...teams].sort((a, b) => b.titleChance - a.titleChance);
  const scoreWeeks = [...new Set((league?.matchups || []).map(game => Number(game.week)))].sort((a, b) => a - b);
  let selectedWeek = currentWeek;
  let selectedSeason = Number(league?.season) || 2026;
  let selectedAnalyticsTab = 'scoring';

  const avatar = team => `<span class="avatar" style="background:${team.color}" aria-hidden="true">${escape(team.abbreviation)}</span>`;
  const moneyline = probability => {
    if (probability == null || probability < .1) return '—';
    const p = Math.min(.9999, Math.max(.0001, probability / 100));
    const raw = p <= .5 ? 100 * (1 - p) / p : -100 * p / (1 - p);
    return `${raw >= 0 ? '+' : '-'}${Math.round(Math.abs(raw) / 5) * 5}`;
  };
  const titleChanceText = probability => probability == null ? '—' : probability < .1 ? '<0.1%' : `${probability.toFixed(1)}%`;
  const winChance = (week, home, away) => prediction?.weekly?.[week]?.find(game => Number(game.home) === Number(home.id) && Number(game.away) === Number(away.id))?.homeChance ?? null;
  const teamLink = (team, extra = '') => `<a class="team-link ${extra}" href="#teams/${team.id}">${avatar(team)}<span class="teamname">${escape(team.name)}</span></a>`;
  const record = team => `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`;

  function gamesForWeek(week) {
    return (league?.matchups || []).filter(game => Number(game.week) === Number(week)).map(game => ({...game, homeTeam: teamById.get(Number(game.home)), awayTeam: teamById.get(Number(game.away))})).filter(game => game.homeTeam && game.awayTeam);
  }

  function buildOdds() {
    const max = Math.max(...ranked.map(team => team.titleChance || 0), 1);
    $('#odds').innerHTML = ranked.map((team, index) => `<div class="odds-row"><span class="place">${index + 1}</span>${teamLink(team)}<span class="record">${record(team)}</span><span class="bar" aria-hidden="true"><span class="fill" style="width:${(team.titleChance || 0) / max * 100}%"></span></span><strong class="moneyline">${moneyline(team.titleChance)}</strong><strong class="pct">${escape(titleChanceText(team.titleChance))}</strong></div>`).join('');
  }

  function buildWeek() {
    $('#week').innerHTML = scoreWeeks.map(week => `<option value="${week}" ${week === selectedWeek ? 'selected' : ''}>Week ${week}</option>`).join('');
    const completed = selectedWeek < currentWeek;
    $('#week-context').textContent = completed ? 'Final ESPN scores' : selectedWeek === currentWeek ? 'Forecast moneylines · ESPN roster projections' : 'Forecast moneylines · team scoring baseline';
    const games = gamesForWeek(selectedWeek);
    $('#matchups').innerHTML = games.length ? games.map((game, index) => {
      const home = game.homeTeam, away = game.awayTeam, chance = winChance(selectedWeek, home, away);
      const homeValue = completed ? format(game.homeScore, 2) : moneyline(chance);
      const awayValue = completed ? format(game.awayScore, 2) : moneyline(chance == null ? null : 100 - chance);
      const homeNote = completed ? (game.homeScore > game.awayScore ? 'Winner' : '') : chance == null ? 'Forecast unavailable' : `${chance.toFixed(1)}% to win`;
      const awayNote = completed ? (game.awayScore > game.homeScore ? 'Winner' : '') : chance == null ? 'Forecast unavailable' : `${(100 - chance).toFixed(1)}% to win`;
      return `<article class="match"><div class="matchtop"><strong>Matchup ${index + 1}</strong><span>${completed ? 'Final score' : 'Forecast moneyline'}</span></div><div class="duel"><div class="side">${teamLink(home)}<div class="chance">${homeValue}<small>${homeNote}</small></div></div><span class="versus">VS</span><div class="side">${teamLink(away)}<div class="chance">${awayValue}<small>${awayNote}</small></div></div></div>${completed || chance == null ? '' : `<div class="probtrack" aria-hidden="true"><div style="width:${chance}%"></div></div>`}</article>`;
    }).join('') : '<p class="empty">No matchups are listed for this week.</p>';
  }

  function buildPoll() {
    const key = `league-hq-ballot-${league.leagueId}-${league.season}-week-${currentWeek}`;
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    $('#poll-week').textContent = `Week ${currentWeek} ballot`;
    $('#picks').innerHTML = [0, 1, 2].map((_, index) => `<div class="pick"><label for="pick${index}">#${index + 1}</label><select id="pick${index}" required><option value="">Choose a team</option>${teams.map(team => `<option value="${team.id}" ${saved.length === 3 && String(saved[index]) === String(team.id) ? 'selected' : ''}>${escape(team.name)}</option>`).join('')}</select></div>`).join('');
    if (saved.length === 3) $('#feedback').textContent = 'Your ballot is saved on this device.';
    $('#poll').addEventListener('submit', event => {
      event.preventDefault();
      const picks = [0, 1, 2].map(index => $(`#pick${index}`).value);
      const feedback = $('#feedback');
      if (new Set(picks).size !== 3) { feedback.className = 'feedback error'; feedback.textContent = 'Choose three different teams.'; return; }
      try { localStorage.setItem(key, JSON.stringify(picks)); feedback.className = 'feedback'; feedback.textContent = 'Ballot saved on this device.'; }
      catch { feedback.className = 'feedback error'; feedback.textContent = 'Browser storage is unavailable; your ballot was not saved.'; }
    });
  }

  function allScoredGames() {
    return (league?.matchups || []).filter(game => Number(game.week) < currentWeek).flatMap(game => [
      {team: teamById.get(Number(game.home)), opponent: teamById.get(Number(game.away)), score: Number(game.homeScore), against: Number(game.awayScore), week: Number(game.week)},
      {team: teamById.get(Number(game.away)), opponent: teamById.get(Number(game.home)), score: Number(game.awayScore), against: Number(game.homeScore), week: Number(game.week)}
    ]).filter(game => game.team && game.opponent);
  }
  const scoredGames = allScoredGames();

  function buildSnapshot() {
    const pointsLeader = [...teams].sort((a, b) => b.pf - a.pf)[0];
    const bestGame = [...scoredGames].sort((a, b) => b.score - a.score)[0];
    const leaguePoints = teams.reduce((total, team) => total + team.pf, 0);
    const leagueMean = scoredGames.length ? scoredGames.reduce((sum, game) => sum + game.score, 0) / scoredGames.length : 0;
    const stats = [
      ['Points leader', pointsLeader?.name || '—', `${format(pointsLeader?.pf, 1)} points for`],
      ['Highest weekly score', bestGame?.team?.name || '—', bestGame ? `${format(bestGame.score, 1)} points · Week ${bestGame.week}` : 'No final scores yet'],
      ['League average', `${format(leagueMean, 1)} pts`, 'Per team per completed week'],
      ['League scoring', format(leaguePoints, 1), `Total through Week ${completedWeeks}`]
    ];
    $('#stats').innerHTML = stats.map(([label, value, note]) => `<div class="stat"><small>${escape(label)}</small><strong>${escape(value)}</strong><span>${escape(note)}</span></div>`).join('');
  }

  function teamGames(team) {
    return (league?.matchups || []).filter(game => Number(game.home) === Number(team.id) || Number(game.away) === Number(team.id)).map(game => {
      const isHome = Number(game.home) === Number(team.id);
      return {week: Number(game.week), opponent: teamById.get(Number(isHome ? game.away : game.home)), score: Number(isHome ? game.homeScore : game.awayScore), against: Number(isHome ? game.awayScore : game.homeScore)};
    }).filter(game => game.opponent).sort((a, b) => a.week - b.week);
  }

  function renderTeams(teamId) {
    const selected = teamById.get(Number(teamId)) || ranked[0];
    const teamPrediction = prediction?.teams?.[selected.id];
    $('#team-list').innerHTML = [...teams].sort((a, b) => a.name.localeCompare(b.name)).map(team => `<a class="team-choice ${team.id === selected.id ? 'active' : ''}" href="#teams/${team.id}">${avatar(team)}<span>${escape(team.name)}</span><small>${record(team)}</small></a>`).join('');
    const recent = teamGames(selected).filter(game => game.week < currentWeek);
    const teamAverage = selected.pf / Math.max(1, completedWeeks);
    const roster = [...(selected.roster || [])].sort((a, b) => {
      const slotOrder = {QB: 0, RB: 1, WR: 2, TE: 3, Flex: 4, 'D/ST': 5, K: 6, Bench: 7, IR: 8};
      return (slotOrder[a.slot] ?? 9) - (slotOrder[b.slot] ?? 9) || b.points - a.points;
    });
    const maxScore = Math.max(...recent.map(game => game.score), 1);
    $('#team-detail').innerHTML = `<div class="detail-head">${avatar(selected)}<div><div class="eyebrow">Team profile</div><h2>${escape(selected.name)}</h2><p>${record(selected)} record · ${format(selected.pf, 1)} points for</p></div></div>
      <div class="detail-metrics"><div><small>Points per game</small><strong>${format(teamAverage, 1)}</strong></div><div><small>Points against</small><strong>${format(selected.pa, 1)}</strong></div><div><small>Week ${currentWeek} forecast</small><strong>${teamPrediction ? format(teamPrediction.currentMean, 1) : '—'}</strong></div><div><small>Title chance</small><strong>${escape(titleChanceText(selected.titleChance))}</strong></div></div>
      <section class="detail-section"><div class="section-line"><h3>Weekly scoring</h3><span>Final scores</span></div><div class="trend">${recent.length ? recent.map(game => `<div class="trend-item"><span>W${game.week}</span><div class="trend-track"><div style="width:${game.score / maxScore * 100}%"></div></div><strong>${format(game.score, 1)}</strong></div>`).join('') : '<p class="empty">No completed weeks yet.</p>'}</div></section>
      <section class="detail-section"><div class="section-line"><h3>Roster</h3><span>${roster.length} players · season and Week ${currentWeek} points</span></div>${roster.length ? `<div class="table-wrap"><table><thead><tr><th>Player</th><th>Position</th><th>Slot</th><th class="numeric">Season</th><th class="numeric">Week ${currentWeek} proj.</th></tr></thead><tbody>${roster.map(player => `<tr><td>${escape(player.name)}${player.injuryStatus && !['ACTIVE','NORMAL'].includes(player.injuryStatus) ? `<small class="injury">${escape(player.injuryStatus)}</small>` : ''}</td><td>${escape(player.position)}</td><td>${escape(player.slot)}</td><td class="numeric">${format(player.points, 1)}</td><td class="numeric">${player.weekProjection == null ? '—' : format(player.weekProjection, 1)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Roster data is not available in this snapshot.</p>'}</section>
      <section class="detail-section"><div class="section-line"><h3>Schedule & results</h3><span>2026 season</span></div><div class="result-list">${teamGames(selected).map(game => `<div class="result-row"><strong>Week ${game.week}</strong><span>vs ${escape(game.opponent.name)}</span><span class="result-value ${game.week < currentWeek ? game.score > game.against ? 'win' : 'loss' : ''}">${game.week < currentWeek ? `${game.score > game.against ? 'W' : game.score < game.against ? 'L' : 'T'} ${format(game.score, 1)}–${format(game.against, 1)}` : 'Upcoming'}</span></div>`).join('')}</div></section>`;
  }

  function allPlay() {
    const results = new Map(teams.map(team => [team.id, 0]));
    for (let week = 1; week < currentWeek; week++) {
      const scores = gamesForWeek(week).flatMap(game => [{id: game.homeTeam.id, score: Number(game.homeScore)}, {id: game.awayTeam.id, score: Number(game.awayScore)}]);
      for (const team of scores) for (const opponent of scores) if (team.id !== opponent.id) results.set(team.id, results.get(team.id) + (team.score > opponent.score ? 1 : team.score === opponent.score ? .5 : 0));
    }
    return results;
  }

  function funAnalytics(allPlayWins) {
    const finished = (league.matchups || []).filter(game => Number(game.week) < currentWeek).map(game => ({...game, homeTeam: teamById.get(Number(game.home)), awayTeam: teamById.get(Number(game.away))})).filter(game => game.homeTeam && game.awayTeam);
    if (!finished.length) return '';
    const weeklyScores = new Map();
    for (const game of scoredGames) {
      if (!weeklyScores.has(game.week)) weeklyScores.set(game.week, []);
      weeklyScores.get(game.week).push(game);
    }
    const crowns = new Map(teams.map(team => [team.id, 0]));
    const basements = new Map(teams.map(team => [team.id, 0]));
    for (const scores of weeklyScores.values()) {
      const highest = Math.max(...scores.map(game => game.score));
      const lowestScore = Math.min(...scores.map(game => game.score));
      for (const game of scores) {
        if (game.score === highest) crowns.set(game.team.id, crowns.get(game.team.id) + 1);
        if (game.score === lowestScore) basements.set(game.team.id, basements.get(game.team.id) + 1);
      }
    }
    const crowned = [...teams].sort((a, b) => crowns.get(b.id) - crowns.get(a.id) || b.pf - a.pf)[0];
    const basement = [...teams].sort((a, b) => basements.get(b.id) - basements.get(a.id) || a.pf - b.pf)[0];
    const luck = teams.map(team => ({team, difference: Number(team.wins) - (allPlayWins.get(team.id) || 0) / Math.max(1, teams.length - 1)})).sort((a, b) => b.difference - a.difference);
    const closest = [...finished].sort((a, b) => Math.abs(a.homeScore - a.awayScore) - Math.abs(b.homeScore - b.awayScore))[0];
    const biggest = [...finished].sort((a, b) => Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore))[0];
    const lowest = [...finished].sort((a, b) => a.homeScore + a.awayScore - b.homeScore - b.awayScore)[0];
    const painful = [...finished].map(game => game.homeScore < game.awayScore ? {loser: game.homeTeam, winner: game.awayTeam, score: game.homeScore, week: game.week} : {loser: game.awayTeam, winner: game.homeTeam, score: game.awayScore, week: game.week}).sort((a, b) => b.score - a.score)[0];
    const swing = teams.map(team => { const values = scoredGames.filter(game => game.team.id === team.id).map(game => game.score); const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); return {team, deviation: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length)), values}; }).sort((a, b) => b.deviation - a.deviation)[0];
    const consistent = teams.map(team => { const values = scoredGames.filter(game => game.team.id === team.id).map(game => game.score); const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); return {team, deviation: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length)), games: values.length}; }).filter(entry => entry.games >= 2).sort((a, b) => a.deviation - b.deviation)[0];
    const cheapestWin = scoredGames.filter(game => game.score > game.against).sort((a, b) => a.score - b.score)[0];
    const pointsAgainst = teams.map(team => ({team, points: scoredGames.filter(game => game.team.id === team.id).reduce((sum, game) => sum + game.against, 0)})).sort((a, b) => b.points - a.points)[0];
    const weekToWeekDrops = teams.flatMap(team => { const games = scoredGames.filter(game => game.team.id === team.id).sort((a, b) => a.week - b.week); return games.slice(1).map((game, index) => ({team, week: game.week, drop: games[index].score - game.score, consecutive: game.week === games[index].week + 1})); }).filter(entry => entry.consecutive && entry.drop > 0).sort((a, b) => b.drop - a.drop);
    const weekToWeekRises = teams.flatMap(team => { const games = scoredGames.filter(game => game.team.id === team.id).sort((a, b) => a.week - b.week); return games.slice(1).map((game, index) => ({team, week: game.week, rise: game.score - games[index].score, consecutive: game.week === games[index].week + 1})); }).filter(entry => entry.consecutive && entry.rise > 0).sort((a, b) => b.rise - a.rise);
    const completedByTeam = teams.map(team => ({team, games: scoredGames.filter(game => game.team.id === team.id).sort((a, b) => a.week - b.week)}));
    const streaks = completedByTeam.flatMap(({team, games}) => ['win', 'loss'].map(kind => { let longest = 0, current = 0, previousWeek = null; for (const game of games) { const qualifies = kind === 'win' ? game.score > game.against : game.score < game.against; current = qualifies ? (previousWeek === game.week - 1 ? current + 1 : 1) : 0; longest = Math.max(longest, current); previousWeek = game.week; } return {team, kind, longest}; }));
    const winStreak = streaks.filter(entry => entry.kind === 'win').sort((a, b) => b.longest - a.longest)[0];
    const lossStreak = streaks.filter(entry => entry.kind === 'loss').sort((a, b) => b.longest - a.longest)[0];
    const wasted = completedByTeam.map(({team, games}) => ({team, points: games.filter(game => game.score < game.against).reduce((sum, game) => sum + game.score, 0), losses: games.filter(game => game.score < game.against).length})).filter(entry => entry.losses).sort((a, b) => b.points - a.points)[0];
    const nailBiters = completedByTeam.map(({team, games}) => ({team, count: games.filter(game => Math.abs(game.score - game.against) <= 10).length})).sort((a, b) => b.count - a.count)[0];
    const weeklyMedian = new Map([...weeklyScores].map(([week, games]) => { const values = games.map(game => game.score).sort((a, b) => a - b); const middle = Math.floor(values.length / 2); return [week, values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2]; }));
    const stolenWins = completedByTeam.map(({team, games}) => ({team, count: games.filter(game => game.score > game.against && game.score < weeklyMedian.get(game.week)).length})).sort((a, b) => b.count - a.count)[0];
    const closestWinner = closest.homeScore >= closest.awayScore ? closest.homeTeam : closest.awayTeam;
    const biggestWinner = biggest.homeScore >= biggest.awayScore ? biggest.homeTeam : biggest.awayTeam;
    const cards = [
      ['Schedule darling', luck[0].team.name, `${format(luck[0].team.wins, 0)} actual ${luck[0].team.wins === 1 ? 'win' : 'wins'}; ${format((allPlayWins.get(luck[0].team.id) || 0) / Math.max(1, teams.length - 1), 1)} expected against the full league`],
      ['Schedule owes you one', luck.at(-1).team.name, `${format(luck.at(-1).team.wins, 0)} actual ${luck.at(-1).team.wins === 1 ? 'win' : 'wins'}; ${format((allPlayWins.get(luck.at(-1).team.id) || 0) / Math.max(1, teams.length - 1), 1)} expected against the full league`],
      ['Escaped by a whisker', closestWinner.name, `Won by ${format(Math.abs(closest.homeScore - closest.awayScore), 2)} points in Week ${closest.week}`],
      ['Brutal loss', painful.loser.name, `Scored ${format(painful.score, 1)} and still lost to ${painful.winner.name}`],
      ['Biggest beatdown', biggestWinner.name, `Won by ${format(Math.abs(biggest.homeScore - biggest.awayScore), 1)} points in Week ${biggest.week}`],
      ['Pillow fight', `${lowest.homeTeam.name} vs ${lowest.awayTeam.name}`, `${format(lowest.homeScore + lowest.awayScore, 1)} combined points in Week ${lowest.week}`],
      ['Human roller coaster', swing.team.name, `${format(swing.deviation, 1)}-point score standard deviation across ${swing.values.length} games`],
    ];
    if (crowns.get(crowned.id)) cards.push(['Weekly throne', crowned.name, `Top score in ${crowns.get(crowned.id)} ${crowns.get(crowned.id) === 1 ? 'week' : 'weeks'}`]);
    if (basements.get(basement.id)) cards.push(['Basement regular', basement.name, `Lowest score in ${basements.get(basement.id)} ${basements.get(basement.id) === 1 ? 'week' : 'weeks'}`]);
    if (consistent) cards.push(['Human metronome', consistent.team.name, `${format(consistent.deviation, 1)}-point score standard deviation across ${consistent.games} games`]);
    if (cheapestWin) cards.push(['Winning ugly', cheapestWin.team.name, `Won Week ${cheapestWin.week} with ${format(cheapestWin.score, 1)} points`]);
    if (pointsAgainst) cards.push(['Punching bag', pointsAgainst.team.name, `${format(pointsAgainst.points, 1)} points scored by opponents so far`]);
    if (weekToWeekDrops.length) cards.push(['Back to earth', weekToWeekDrops[0].team.name, `Dropped ${format(weekToWeekDrops[0].drop, 1)} points from Week ${weekToWeekDrops[0].week - 1} to ${weekToWeekDrops[0].week}`]);
    if (weekToWeekRises.length) cards.push(['Bounce-back week', weekToWeekRises[0].team.name, `Scored ${format(weekToWeekRises[0].rise, 1)} more points in Week ${weekToWeekRises[0].week} than the week before`]);
    if (winStreak?.longest) cards.push(['Hot hand', winStreak.team.name, `${winStreak.longest} straight completed-week wins`]);
    if (lossStreak?.longest) cards.push(['Cold streak', lossStreak.team.name, `${lossStreak.longest} straight completed-week losses`]);
    if (wasted) cards.push(['Points down the drain', wasted.team.name, `${format(wasted.points, 1)} points scored across ${wasted.losses} ${wasted.losses === 1 ? 'loss' : 'losses'}`]);
    if (nailBiters?.count) cards.push(['Drama magnet', nailBiters.team.name, `${nailBiters.count} ${nailBiters.count === 1 ? 'game' : 'games'} decided by 10 points or fewer`]);
    if (stolenWins?.count) cards.push(['Stole one', stolenWins.team.name, `${stolenWins.count} ${stolenWins.count === 1 ? 'win' : 'wins'} with a score below that week's league median`]);
    const alternate = [...teams].map(team => ({team, expected: (allPlayWins.get(team.id) || 0) / Math.max(1, teams.length - 1)})).sort((a, b) => b.expected - a.expected || b.team.pf - a.team.pf);
    return `<section class="card analytics-card fun-section" data-analytics-panel="roasts"><div class="cardhead"><div><h2>Receipts & roasts</h2><p>Every jab here comes from a completed ESPN matchup.</p></div><span class="tag">For the group chat</span></div><div class="fun-grid">${cards.map(([label, subject, detail]) => `<div class="fun-card"><small>${escape(label)}</small><strong>${escape(subject)}</strong><p>${escape(detail)}</p></div>`).join('')}</div><p class="fun-note">Weekly throne and Basement regular count ties for the highest or lowest score. Score variation is the population standard deviation of completed weekly scores.</p></section>
      <section class="card analytics-card alternate-section" data-analytics-panel="schedule"><div class="cardhead"><div><h2>Alternate universe standings</h2><p>What each record would look like if every team's score faced the whole league each week.</p></div><span class="tag">Schedule luck</span></div><div class="alternate-table"><div class="alternate-row alternate-head"><span>Rank</span><span>Team</span><span>Actual W</span><span>All-play W</span><span>All-play EW</span><span>Projected W</span><span>Luck</span></div>${alternate.map(({team, expected}, index) => { const difference = Number(team.wins) - expected; return `<div class="alternate-row"><span>${index + 1}</span>${teamLink(team)}<strong>${format(team.wins, 0)}</strong><strong>${formatAllPlay(allPlayWins.get(team.id))}</strong><strong>${format(expected, 1)}</strong><strong>${prediction?.teams?.[team.id]?.expectedFinalWins == null ? '—' : format(prediction.teams[team.id].expectedFinalWins, 2)}</strong><strong class="${difference > .05 ? 'luck-positive' : difference < -.05 ? 'luck-negative' : ''}">${difference > 0 ? '+' : ''}${format(difference, 1)}</strong></div>`; }).join('')}</div><p class="fun-note">All-play W counts wins against every other team's score in the same week (ties count as half). All-play EW = all-play W ÷ ${Math.max(1, teams.length - 1)}; it describes games already played. Projected W is the forecast average final regular-season wins across ${prediction?.simulations?.toLocaleString() || 'the'} season simulations, including wins already earned. Luck = actual wins − all-play EW.</p></section>`;
  }

  function renderCurrentAnalytics() {
    const allPlayWins = allPlay();
    const leaderboard = [...teams].sort((a, b) => b.pf - a.pf);
    const maxAverage = Math.max(...leaderboard.map(team => team.pf / Math.max(1, completedWeeks)), 1);
    const topAllPlay = [...teams].sort((a, b) => allPlayWins.get(b.id) - allPlayWins.get(a.id))[0];
    const bestGame = [...scoredGames].sort((a, b) => b.score - a.score)[0];
    const availableHistory = history.map(season => Number(season.season)).sort((a, b) => b - a);
    const missingHistory = (league.previousSeasons || []).filter(year => !availableHistory.includes(Number(year)));
    const comparisonNote = availableHistory.length ? `${availableHistory.join(', ')} ${availableHistory.length === 1 ? 'is' : 'are'} connected. ${missingHistory.length ? `${missingHistory.join(', ')} still require authorized ESPN data.` : 'All listed seasons are connected.'}` : `ESPN lists ${escape((league.previousSeasons || []).join(', '))} as previous seasons. Their records require authorized access before comparisons can be calculated.`;
    $('#analytics-content').innerHTML = `<div class="analytics-tabs" role="tablist" aria-label="Analytics sections">${[['scoring', 'Scoring'], ['roasts', 'Receipts & roasts'], ['schedule', 'Schedule luck'], ['history', 'History']].map(([id, label]) => `<button type="button" class="analytics-tab" role="tab" data-analytics-tab="${id}" aria-selected="false">${label}</button>`).join('')}</div><div data-analytics-panel="scoring"><div class="analytics-summary"><div class="metric-card"><small>Top all-play team</small><strong>${escape(topAllPlay?.name || '—')}</strong><span>${formatAllPlay(allPlayWins.get(topAllPlay?.id))} wins against the field</span></div><div class="metric-card"><small>Highest single week</small><strong>${escape(bestGame?.team?.name || '—')}</strong><span>${bestGame ? `${format(bestGame.score, 1)} points · Week ${bestGame.week}` : 'No completed games'}</span></div><div class="metric-card"><small>Completed weeks</small><strong>${completedWeeks}</strong><span>2026 regular season to date</span></div></div>
      <div class="card analytics-card"><div class="cardhead"><div><h2>Scoring leaderboard</h2><p>Points per game; all-play compares each score with every other team that week.</p></div></div><div class="leaderboard">${leaderboard.map((team, index) => `<div class="leader-row"><span class="place">${index + 1}</span>${teamLink(team)}<span class="leader-bar" aria-hidden="true"><span style="width:${team.pf / Math.max(1, completedWeeks) / maxAverage * 100}%"></span></span><strong>${format(team.pf / Math.max(1, completedWeeks), 1)} PPG</strong><small>${formatAllPlay(allPlayWins.get(team.id))} all-play W</small></div>`).join('')}</div></div></div>
      ${funAnalytics(allPlayWins)}
      <div data-analytics-panel="history"><div class="card analytics-card"><div class="cardhead"><div><h2>Season comparisons</h2><p>Select a year above to inspect its standings and scoring leaders.</p></div></div><p class="card-copy">${escape(comparisonNote)}</p></div></div>`;
    selectAnalyticsTab(selectedAnalyticsTab);
  }

  function selectAnalyticsTab(tab) {
    const available = ['scoring', 'roasts', 'schedule', 'history'];
    selectedAnalyticsTab = available.includes(tab) ? tab : 'scoring';
    document.querySelectorAll('[data-analytics-panel]').forEach(panel => { panel.hidden = panel.dataset.analyticsPanel !== selectedAnalyticsTab; });
    document.querySelectorAll('[data-analytics-tab]').forEach(button => {
      const active = button.dataset.analyticsTab === selectedAnalyticsTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }

  function renderPastAnalytics(season) {
    const year = history.find(entry => Number(entry.season) === Number(season));
    if (!year) {
      $('#analytics-content').innerHTML = `<div class="card unavailable"><div class="eyebrow">${season} season</div><h2>Historical data needs access</h2><p>ESPN lists this season for Bye-Bye Jimmy, but its public data request was denied. Once an authorized export is added, this page will show its standings, scoring leaders, and season comparisons.</p></div>`;
      return;
    }
    const standings = [...year.teams].sort((a, b) => b.wins - a.wins || b.pf - a.pf);
    const scoring = [...year.teams].sort((a, b) => b.pf - a.pf);
    const champion = year.teams.find(team => Number(team.finalRank) === 1);
    $('#analytics-content').innerHTML = `<div class="analytics-summary"><div class="metric-card"><small>Champion</small><strong>${escape(champion?.name || 'Not recorded')}</strong><span>${champion ? `${champion.wins}-${champion.losses} record` : 'ESPN rank unavailable'}</span></div><div class="metric-card"><small>Points leader</small><strong>${escape(scoring[0]?.name || '—')}</strong><span>${format(scoring[0]?.pf, 1)} points</span></div><div class="metric-card"><small>Teams</small><strong>${year.teams.length}</strong><span>${season} season</span></div></div><div class="card analytics-card"><div class="cardhead"><div><h2>${season} standings</h2><p>Final record and points scored.</p></div></div><div class="history-rows">${standings.map((team, index) => `<div class="history-row"><span class="place">${index + 1}</span><strong>${escape(team.name)}</strong><span>${team.wins}-${team.losses}</span><span>${format(team.pf, 1)} PF</span></div>`).join('')}</div></div>`;
  }

  function renderAnalytics(season = selectedSeason) {
    selectedSeason = season;
    const seasons = [Number(league.season), ...(league.previousSeasons || []).map(Number).sort((a, b) => b - a)];
    $('#season-tabs').innerHTML = seasons.map(year => `<button type="button" class="season-tab ${year === selectedSeason ? 'active' : ''}" data-season="${year}" aria-pressed="${year === selectedSeason}">${year}</button>`).join('');
    if (season === Number(league.season)) renderCurrentAnalytics(); else renderPastAnalytics(season);
  }

  function route() {
    const hash = location.hash.replace(/^#/, '');
    const [view, detail] = hash.split('/');
    const page = ['teams', 'analytics'].includes(view) ? view : 'overview';
    document.querySelectorAll('[data-page]').forEach(section => section.hidden = section.dataset.page !== page);
    document.querySelectorAll('.nav-link').forEach(link => { const active = link.dataset.nav === page; link.classList.toggle('active', active); link.setAttribute('aria-current', active ? 'page' : 'false'); });
    if (page === 'teams') renderTeams(detail);
    if (page === 'analytics') renderAnalytics();
    window.scrollTo(0, 0);
  }

  if (!league || !teams.length) {
    $('#main').innerHTML = '<div class="card unavailable"><h1>League data is unavailable</h1><p>Start the local dashboard server or refresh the ESPN snapshot, then reload this page.</p></div>';
    return;
  }
  $('#league-meta').textContent = `${league.season} season · ${teams.length} teams · ESPN data`;
  $('#champ-week').textContent = `Week ${currentWeek}`;
  $('#champ-context').textContent = prediction ? `${prediction.simulations.toLocaleString()} season simulations · fair American odds` : 'Forecast temporarily unavailable';
  $('#data-label').textContent = 'ESPN league data';
  buildOdds(); buildWeek(); buildPoll(); buildSnapshot();
  $('#week').addEventListener('change', event => { selectedWeek = Number(event.target.value); buildWeek(); });
  $('#analytics-content').addEventListener('click', event => { const button = event.target.closest('[data-analytics-tab]'); if (button) selectAnalyticsTab(button.dataset.analyticsTab); });
  $('#analytics-content').addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; const buttons = [...document.querySelectorAll('[data-analytics-tab]')]; if (!buttons.length) return; const index = buttons.findIndex(button => button === document.activeElement); if (index < 0) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length; selectAnalyticsTab(buttons[next].dataset.analyticsTab); buttons[next].focus(); });
  $('#season-tabs').addEventListener('click', event => { const button = event.target.closest('[data-season]'); if (button) renderAnalytics(Number(button.dataset.season)); });
  window.addEventListener('hashchange', route);
  route();
})();
