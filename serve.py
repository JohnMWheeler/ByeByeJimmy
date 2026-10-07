#!/usr/bin/env python3
"""Serve the private local dashboard with a fresh ESPN snapshot on page load."""

import argparse
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from sync_espn import fetch_league, normalize
from forecast import forecast, javascript_assignment, load_history


ROOT = Path(__file__).parent
LEAGUE_ID = 696510781
SEASON = 2026
CACHE_SECONDS = 300
cache = {"time": 0.0, "league": None, "forecast": None}


def refresh_cache():
    if cache["league"] and time.time() - cache["time"] <= CACHE_SECONDS:
        return
    data = normalize(fetch_league(LEAGUE_ID, SEASON), SEASON)
    if not data["teams"]:
        raise ValueError("ESPN returned no teams")
    prediction = forecast(data, load_history(ROOT / "history-data.js"))
    league_body = javascript_assignment("espnLeagueData", data).encode()
    forecast_body = javascript_assignment("espnForecastData", prediction).encode()
    (ROOT / "league-data.js").write_bytes(league_body)
    (ROOT / "forecast-data.js").write_bytes(forecast_body)
    cache.update(time=time.time(), league=league_body, forecast=forecast_body)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self.send_file(ROOT / "index.html", "text/html; charset=utf-8")
        elif path == "/styles.css":
            self.send_file(ROOT / "styles.css", "text/css; charset=utf-8")
        elif path == "/app.js":
            self.send_file(ROOT / "app.js", "application/javascript; charset=utf-8")
        elif path == "/history-data.js":
            self.send_file(ROOT / "history-data.js", "application/javascript; charset=utf-8")
        elif path in ("/league-data.js", "/forecast-data.js"):
            filename = path.lstrip("/")
            try:
                refresh_cache()
                self.send_bytes(cache["league" if filename == "league-data.js" else "forecast"], "application/javascript; charset=utf-8")
            except Exception as exc:
                self.log_error("ESPN refresh failed: %s", exc)
                snapshot = ROOT / filename
                if snapshot.exists():
                    self.send_file(snapshot, "application/javascript; charset=utf-8")
                else:
                    variable = "espnLeagueData" if filename == "league-data.js" else "espnForecastData"
                    self.send_bytes(f"window.{variable} = null;\n".encode(), "application/javascript; charset=utf-8")
        else:
            self.send_error(404)

    def send_file(self, path, content_type):
        self.send_bytes(path.read_bytes(), content_type)

    def send_bytes(self, data, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Bye-Bye Jimmy is running at http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
