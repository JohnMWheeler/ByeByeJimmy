#!/usr/bin/env python3
"""Fetch an ESPN fantasy football league into the local Bye-Bye Jimmy dashboard.

Usage: python3 sync_espn.py LEAGUE_ID --season 2026
For a private league, supply ESPN_S2 and SWID as environment variables locally.
The values are never written to the generated league-data.js file.
"""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from forecast import forecast, javascript_assignment, load_history


def fetch_league(league_id: int, season: int, include_rosters: bool = True) -> dict:
    base = (
        "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/"
        f"{season}/segments/0/leagues/{league_id}"
    )
    views = ["mTeam", "mMatchup", "mSettings"]
    if include_rosters:
        views.append("mRoster")
    query = urlencode([("view", view) for view in views])
    headers = {"Accept": "application/json", "User-Agent": "ByeByeJimmyLeagueDashboard/1.0"}
    espn_s2, swid = os.getenv("ESPN_S2"), os.getenv("SWID")
    if espn_s2 and swid:
        headers["Cookie"] = f"espn_s2={espn_s2}; SWID={swid}"
    try:
        with urlopen(Request(f"{base}?{query}", headers=headers), timeout=20) as response:
            if "application/json" not in response.headers.get("Content-Type", ""):
                raise RuntimeError("ESPN returned a web page instead of league data.")
            return json.load(response)
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise RuntimeError(
                "ESPN denied access. Check the league ID and public viewability, "
                "or provide ESPN_S2 and SWID locally for a private league."
            ) from exc
        raise RuntimeError(f"ESPN returned HTTP {exc.code}.") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach ESPN: {exc.reason}") from exc


def normalize(raw: dict, season: int) -> dict:
    league_id = raw.get("id")
    current_week = raw.get("status", {}).get("currentMatchupPeriod")
    teams = []
    positions = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}
    slots = {0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K", 20: "Bench", 21: "IR", 23: "Flex"}
    for team in raw.get("teams", []):
        overall = team.get("record", {}).get("overall", {})
        roster = []
        for entry in team.get("roster", {}).get("entries", []):
            player = entry.get("playerPoolEntry", {}).get("player", {})
            season_stat = next(
                (
                    stat for stat in player.get("stats", [])
                    if stat.get("seasonId") == season
                    and stat.get("scoringPeriodId") == 0
                    and stat.get("statSourceId") == 0
                    and stat.get("statSplitTypeId") == 0
                ),
                {},
            )
            projection_stat = next(
                (
                    stat for stat in player.get("stats", [])
                    if stat.get("seasonId") == season
                    and stat.get("scoringPeriodId") == current_week
                    and stat.get("statSourceId") == 1
                    and stat.get("statSplitTypeId") == 1
                ),
                None,
            )
            if player.get("fullName"):
                roster.append({
                    "id": player.get("id"),
                    "name": player["fullName"],
                    "position": positions.get(player.get("defaultPositionId"), "—"),
                    "slot": slots.get(entry.get("lineupSlotId"), "Flex"),
                    "points": round(float(season_stat.get("appliedTotal") or 0), 2),
                    "weekProjection": round(float(projection_stat.get("appliedTotal") or 0), 2) if projection_stat else None,
                    "injuryStatus": player.get("injuryStatus") or "ACTIVE",
                })
        teams.append(
            {
                "id": team["id"],
                "name": team.get("name") or " ".join(
                    part for part in (team.get("location"), team.get("nickname")) if part
                ) or f"Team {team['id']}",
                "abbr": team.get("abbrev") or "",
                "wins": overall.get("wins", 0),
                "losses": overall.get("losses", 0),
                "ties": overall.get("ties", 0),
                "pf": round(float(overall.get("pointsFor") or 0), 2),
                "pa": round(float(overall.get("pointsAgainst") or 0), 2),
                "finalRank": team.get("rankFinal") or team.get("rankCalculatedFinal"),
                "roster": roster,
            }
        )
    matchups = []
    for matchup in raw.get("schedule", []):
        home, away = matchup.get("home") or {}, matchup.get("away") or {}
        if "teamId" in home and "teamId" in away:
            matchups.append(
                {
                    "week": matchup.get("matchupPeriodId"),
                    "home": home["teamId"],
                    "away": away["teamId"],
                    "homeScore": round(float(home.get("totalPoints") or 0), 2),
                    "awayScore": round(float(away.get("totalPoints") or 0), 2),
                }
            )
    return {
        "leagueId": league_id,
        "name": raw.get("settings", {}).get("name") or "Bye-Bye Jimmy",
        "season": season,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "currentWeek": current_week,
        "previousSeasons": raw.get("status", {}).get("previousSeasons", []),
        "playoffSettings": {
            "teamCount": raw.get("settings", {}).get("scheduleSettings", {}).get("playoffTeamCount"),
            "regularSeasonWeeks": raw.get("settings", {}).get("scheduleSettings", {}).get("matchupPeriodCount"),
            "reseed": raw.get("settings", {}).get("scheduleSettings", {}).get("playoffReseed"),
        },
        "lineupSlots": raw.get("settings", {}).get("rosterSettings", {}).get("lineupSlotCounts", {}),
        "teams": teams,
        "matchups": matchups,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("league_id", type=int)
    parser.add_argument("--season", type=int, default=2026)
    args = parser.parse_args()
    try:
        data = normalize(fetch_league(args.league_id, args.season), args.season)
    except RuntimeError as exc:
        parser.exit(1, f"{exc}\n")
    if not data["teams"]:
        raise SystemExit("ESPN returned no teams; no dashboard data was changed.")
    if not data["matchups"]:
        raise SystemExit("ESPN returned no matchups; no dashboard data was changed.")
    root = Path(__file__).parent
    prediction = forecast(data, load_history(root / "history-data.js"))
    (root / "league-data.js").write_text(javascript_assignment("espnLeagueData", data), encoding="utf-8")
    (root / "forecast-data.js").write_text(javascript_assignment("espnForecastData", prediction), encoding="utf-8")
    print(f"Updated ESPN snapshot and forecast: {len(data['teams'])} teams, {len(data['matchups'])} matchups, {prediction['simulations']:,} simulations")


if __name__ == "__main__":
    main()
