#!/usr/bin/env python3
"""Import past ESPN seasons without putting ESPN account data in the website.

Examples:
  python3 import_history.py --fetch
  python3 import_history.py --file 2025 /path/to/espn-2025.json

The first form attempts 2022–2025 using public access or local ESPN_S2 and SWID
environment variables. The second form accepts a JSON response saved from ESPN
while signed in. Only normalized team and matchup data is written to the site.
"""

import argparse
import json
from pathlib import Path

from sync_espn import fetch_league, normalize
from forecast import forecast, javascript_assignment


ROOT = Path(__file__).parent
DESTINATION = ROOT / "history-data.js"
LEAGUE_ID = 696510781
YEARS = [2022, 2023, 2024, 2025]


def existing() -> dict:
    if not DESTINATION.exists():
        return {}
    source = DESTINATION.read_text(encoding="utf-8")
    marker = "window.espnHistoryData = "
    if marker not in source:
        return {}
    try:
        payload = source.split(marker, 1)[1].strip().rstrip(";")
        return {int(item["season"]): item for item in json.loads(payload)}
    except (ValueError, KeyError, TypeError):
        return {}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--fetch", action="store_true", help="Try each past season at ESPN")
    source.add_argument("--file", nargs=2, metavar=("YEAR", "JSON_FILE"), help="Import one saved ESPN JSON response")
    args = parser.parse_args()
    seasons = existing()
    if args.fetch:
        for year in YEARS:
            try:
                raw = fetch_league(LEAGUE_ID, year, include_rosters=False)
                if int(raw.get("id", -1)) != LEAGUE_ID:
                    raise ValueError("League ID does not match")
                seasons[year] = normalize(raw, year)
                print(f"Imported {year}")
            except (RuntimeError, ValueError) as exc:
                print(f"Skipped {year}: {exc}")
    else:
        year_text, source_path = args.file
        year = int(year_text)
        if year not in YEARS:
            parser.error(f"YEAR must be one of {YEARS}")
        raw = json.loads(Path(source_path).read_text(encoding="utf-8"))
        if int(raw.get("id", -1)) != LEAGUE_ID:
            parser.error("The JSON file is not for Bye-Bye Jimmy league 696510781")
        seasons[year] = normalize(raw, year)
        print(f"Imported {year}")
    payload = json.dumps([seasons[year] for year in sorted(seasons)], ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c")
    DESTINATION.write_text(f"window.espnHistoryData = {payload};\n", encoding="utf-8")
    current = ROOT / "league-data.js"
    marker = "window.espnLeagueData = "
    if current.exists() and marker in current.read_text(encoding="utf-8"):
        league = json.loads(current.read_text(encoding="utf-8").split(marker, 1)[1].strip().rstrip(";"))
        prediction = forecast(league, [seasons[year] for year in sorted(seasons)])
        (ROOT / "forecast-data.js").write_text(javascript_assignment("espnForecastData", prediction), encoding="utf-8")
    print(f"Historical seasons available: {', '.join(map(str, sorted(seasons))) or 'none'}")


if __name__ == "__main__":
    main()
