"""Deterministic fantasy-football forecasts from normalized ESPN league data.

This is a transparent first forecast, not a calibrated sportsbook model. It uses
current-week roster projections, completed scores, and Monte Carlo simulations.
"""

import hashlib
import json
import math
import random
from collections import defaultdict
from pathlib import Path


SIMULATIONS = 30000
RECENCY_DECAY = 0.65


def load_history(path):
    try:
        source = Path(path).read_text(encoding="utf-8")
        marker = "window.espnHistoryData = "
        return json.loads(source.split(marker, 1)[1].strip().rstrip(";")) if marker in source else []
    except (OSError, ValueError, IndexError):
        return []


def javascript_assignment(name, data):
    payload = json.dumps(data, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c")
    return f"window.{name} = {payload};\n"


def completed_scores(league):
    current_week = int(league.get("currentWeek") or 1)
    regular_weeks = int(league.get("playoffSettings", {}).get("regularSeasonWeeks") or current_week - 1)
    by_team = defaultdict(list)
    for game in league.get("matchups", []):
        week = int(game.get("week") or 0)
        if 0 < week < current_week and week <= regular_weeks:
            by_team[int(game["home"])].append((week, float(game["homeScore"])))
            by_team[int(game["away"])].append((week, float(game["awayScore"])))
    return by_team


def pooled_variance(league):
    by_team = completed_scores(league)
    squared, degrees = 0.0, 0
    for games in by_team.values():
        scores = [score for _, score in games]
        if len(scores) < 2:
            continue
        mean = sum(scores) / len(scores)
        squared += sum((score - mean) ** 2 for score in scores)
        degrees += len(scores) - 1
    return squared / degrees if degrees else None


def projected_lineup(team, lineup_slots):
    roster = [player for player in team.get("roster", []) if player.get("slot") != "IR" and player.get("weekProjection") is not None]
    roster = [player for player in roster if player.get("injuryStatus") not in ("OUT", "INJURY_RESERVE", "SUSPENSION")]
    required = {
        "QB": int(lineup_slots.get("0", 1)),
        "RB": int(lineup_slots.get("2", 2)),
        "WR": int(lineup_slots.get("4", 2)),
        "TE": int(lineup_slots.get("6", 1)),
        "D/ST": int(lineup_slots.get("16", 1)),
        "K": int(lineup_slots.get("17", 1)),
    }
    flex_count = int(lineup_slots.get("23", 2))
    selected = set()
    points = 0.0
    for position, count in required.items():
        candidates = sorted(
            (player for player in roster if player.get("position") == position and player.get("id") not in selected),
            key=lambda player: float(player.get("weekProjection") or 0),
            reverse=True,
        )
        for player in candidates[:count]:
            selected.add(player["id"])
            points += float(player.get("weekProjection") or 0)
    flex_candidates = sorted(
        (player for player in roster if player.get("position") in ("RB", "WR", "TE") and player.get("id") not in selected),
        key=lambda player: float(player.get("weekProjection") or 0),
        reverse=True,
    )
    for player in flex_candidates[:flex_count]:
        selected.add(player["id"])
        points += float(player.get("weekProjection") or 0)
    expected_count = sum(required.values()) + flex_count
    return points, len(selected), expected_count


def normal_win_probability(mean_a, mean_b, sigma_a, sigma_b):
    spread = math.sqrt(sigma_a ** 2 + sigma_b ** 2)
    if spread == 0:
        return 0.5
    return 0.5 * (1 + math.erf((mean_a - mean_b) / (spread * math.sqrt(2))))


def bracket_round(entrants, play, reseed=False):
    """Advance a seeded bracket round; entrants are ordered by original seed."""
    if reseed:
        games = [(entrants[i], entrants[-i - 1]) for i in range(len(entrants) // 2)]
    else:
        games = [(entrants[i], entrants[i + 1]) for i in range(0, len(entrants), 2)]
    winners = [play(home, away)[0] for home, away in games]
    return sorted(winners, key=entrants.index) if reseed else winners


def forecast(league, history=None, simulations=SIMULATIONS):
    history = history or []
    teams = league.get("teams", [])
    if not teams:
        raise ValueError("No teams available for forecasting")
    team_ids = {int(team["id"]) for team in teams}
    current_week = int(league.get("currentWeek") or 1)
    regular_weeks = int(league.get("playoffSettings", {}).get("regularSeasonWeeks") or max(game["week"] for game in league["matchups"]))
    playoff_count = int(league.get("playoffSettings", {}).get("teamCount") or 8)
    if playoff_count != 8:
        raise ValueError("This first simulation requires an eight-team playoff bracket")
    reseed = bool(league.get("playoffSettings", {}).get("reseed"))
    scores = completed_scores(league)
    all_scores = [score for games in scores.values() for _, score in games]
    league_mean = sum(all_scores) / len(all_scores) if all_scores else 120.0
    current_variance = pooled_variance(league)
    historical_variances = [value for season in history if (value := pooled_variance(season)) is not None]
    historical_variance = sum(historical_variances) / len(historical_variances) if historical_variances else None
    if current_variance is None and historical_variance is None:
        league_variance = 28.0 ** 2
    elif current_variance is None:
        league_variance = historical_variance
    elif historical_variance is None:
        league_variance = current_variance
    else:
        league_variance = 0.7 * current_variance + 0.3 * historical_variance
    league_variance = min(45.0 ** 2, max(18.0 ** 2, league_variance))

    team_forecasts = {}
    for team in teams:
        team_id = int(team["id"])
        games = scores[team_id]
        values = [score for _, score in games]
        season_mean = sum(values) / len(values) if values else league_mean
        weighted = [(RECENCY_DECAY ** (current_week - week - 1), score) for week, score in games]
        recent_mean = sum(weight * score for weight, score in weighted) / sum(weight for weight, _ in weighted) if weighted else league_mean
        baseline = 0.55 * recent_mean + 0.25 * season_mean + 0.20 * league_mean
        projection, filled, expected = projected_lineup(team, league.get("lineupSlots", {}))
        coverage = filled / expected if expected else 0
        # Empty Tuesday lineup spots are treated as uncertain replacements, not zeroes.
        adjusted_projection = projection + max(0, expected - filled) * league_mean / max(1, expected)
        projection_weight = 0.60 * coverage if filled else 0.0
        current_mean = projection_weight * adjusted_projection + (1 - projection_weight) * baseline
        if len(values) >= 2:
            sample_variance = sum((score - season_mean) ** 2 for score in values) / (len(values) - 1)
            team_variance = (len(values) - 1) / (len(values) + 3) * sample_variance + 4 / (len(values) + 3) * league_variance
        else:
            team_variance = league_variance
        sigma = min(45.0, max(18.0, math.sqrt(team_variance)))
        team_forecasts[team_id] = {
            "baseline": round(baseline, 2),
            "currentMean": round(current_mean, 2),
            "lineupProjection": round(projection, 2) if filled else None,
            "lineupCoverage": round(coverage, 2),
            "sigma": round(sigma, 2),
        }

    weekly = {}
    future_schedule = defaultdict(list)
    for game in league.get("matchups", []):
        week = int(game.get("week") or 0)
        home, away = int(game["home"]), int(game["away"])
        if week < current_week or week > regular_weeks or home not in team_ids or away not in team_ids:
            continue
        future_schedule[week].append((home, away))
        home_forecast, away_forecast = team_forecasts[home], team_forecasts[away]
        mean_key = "currentMean" if week == current_week else "baseline"
        probability = normal_win_probability(
            home_forecast[mean_key], away_forecast[mean_key],
            home_forecast["sigma"], away_forecast["sigma"],
        )
        weekly.setdefault(str(week), []).append({
            "home": home,
            "away": away,
            "homeChance": round(100 * probability, 2),
            "homeMean": home_forecast[mean_key],
            "awayMean": away_forecast[mean_key],
        })

    seed_input = json.dumps({
        "league": league.get("leagueId"), "season": league.get("season"), "week": current_week,
        "teams": [(team["id"], team["wins"], team["pf"], team_forecasts[int(team["id"])]) for team in teams],
    }, sort_keys=True).encode()
    seed = int.from_bytes(hashlib.sha256(seed_input).digest()[:8], "big")
    rng = random.Random(seed)
    title_counts = {team_id: 0 for team_id in team_ids}
    final_wins_total = {team_id: 0.0 for team_id in team_ids}

    def draw(team_id, is_current=False):
        item = team_forecasts[team_id]
        mean = item["currentMean"] if is_current else item["baseline"]
        return max(0.0, rng.gauss(mean, item["sigma"]))

    def play(home, away, is_current=False):
        score_home, score_away = draw(home, is_current), draw(away, is_current)
        winner = home if score_home >= score_away else away
        return winner, score_home, score_away

    for _ in range(simulations):
        standings = {int(team["id"]): [float(team["wins"]) + 0.5 * float(team.get("ties") or 0), float(team["pf"])] for team in teams}
        for week in range(current_week, regular_weeks + 1):
            for home, away in future_schedule.get(week, []):
                winner, score_home, score_away = play(home, away, week == current_week)
                standings[winner][0] += 1
                standings[home][1] += score_home
                standings[away][1] += score_away
        for team_id in team_ids:
            final_wins_total[team_id] += standings[team_id][0]
        seeds = sorted(team_ids, key=lambda team_id: (-standings[team_id][0], -standings[team_id][1], team_id))[:playoff_count]
        quarterfinals = [(seeds[0], seeds[7]), (seeds[3], seeds[4]), (seeds[1], seeds[6]), (seeds[2], seeds[5])]
        semifinalists = [play(a, b)[0] for a, b in quarterfinals]
        if reseed:
            semifinalists = sorted(semifinalists, key=seeds.index)
        finalists = bracket_round(semifinalists, play, reseed)
        champion = play(finalists[0], finalists[1])[0]
        title_counts[champion] += 1

    return {
        "leagueId": league.get("leagueId"),
        "season": league.get("season"),
        "week": current_week,
        "asOf": league.get("fetchedAt"),
        "simulations": simulations,
        "playoffReseed": reseed,
        "historyYearsUsed": [season.get("season") for season in history if pooled_variance(season) is not None],
        "leagueScoreSigma": round(math.sqrt(league_variance), 2),
        "teams": {str(team_id): {**team_forecasts[team_id], "titleChance": round(100 * (count + 0.5) / (simulations + 0.5 * len(teams)), 4), "expectedFinalWins": round(final_wins_total[team_id] / simulations, 2)} for team_id, count in title_counts.items()},
        "weekly": weekly,
    }
