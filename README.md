# Bye-Bye Jimmy dashboard

The local dashboard is connected to ESPN fantasy football league `696510781` for the 2026 season.

## Share the saved site with league members

Share the public repository link with league members. On GitHub, each member can choose **Code → Download ZIP**, extract the folder, and open `index.html` in a browser. The ZIP contains the most recently saved league and forecast snapshots; members do not need Python to view them. Download a new ZIP after you upload an updated snapshot. Poll ballots are saved only in each browser and are not shared across members.

## Open the connected dashboard

In Terminal, from this folder, run:

```sh
python3 serve.py
```

Then open <http://127.0.0.1:8765/>. The server checks ESPN when the page loads and caches its response for five minutes. It listens only on this computer. If ESPN is temporarily unavailable, it serves the last saved league snapshot.

You can also open `index.html` directly to view the last saved snapshot without starting the server. That view does not refresh automatically.

The dashboard has Overview, Teams, and Analytics views. It takes team names, current rosters, player projections, records, points, and scheduled matchups from ESPN. Past weeks show final scores. Future-week moneylines use the forecast described in [ODDS_MODEL.md](ODDS_MODEL.md), and championship odds come from 30,000 season simulations. These are fair model estimates, not sportsbook lines. The Analytics view has tabs for scoring, “Receipts & roasts,” schedule luck, and history. Its matchup-based awards include streaks, scoring swings, wasted points in losses, close-game drama, and wins below the weekly league median. Its alternate-universe standings compare actual wins, descriptive all-play expected wins, and projected final regular-season wins from the forecast. Projected wins retain two decimal places; existing ties count as half a win. For all-play expected wins, each weekly score faces every other team that week, ties count half, and that all-play total is divided by the number of possible opponents. Poll ballots remain in each browser's local storage and are not shared among league members.

ESPN lists 2022–2025 as previous seasons, but anonymous requests for those records were denied. The Analytics view shows an access message for each unavailable year and will display real standings once a year is imported. To import a JSON response saved from ESPN while signed in:

```sh
python3 import_history.py --file 2025 /path/to/espn-2025.json
```

Repeat for the other years. The importer writes only team and matchup facts to `history-data.js`; member account details from the raw ESPN response are excluded. You can also try `python3 import_history.py --fetch` if ESPN access is available locally. Do not put login credentials in project files or send them in chat.

To update the offline league and forecast snapshots manually:

```sh
python3 sync_espn.py 696510781 --season 2026
```

Do not put ESPN login details in these files. If public viewability changes, the connection will need a private authentication path.
