import copy
import unittest

from forecast import bracket_round, completed_scores, forecast, normal_win_probability, projected_lineup


class ForecastTests(unittest.TestCase):
    def test_best_legal_lineup_can_use_bench_players(self):
        slots = {key: 0 for key in ("0", "2", "4", "6", "16", "17", "23")}
        slots.update({"0": 1, "2": 1, "4": 1, "23": 1})
        roster = [
            {"id": 1, "position": "QB", "slot": "QB", "weekProjection": 10},
            {"id": 2, "position": "RB", "slot": "RB", "weekProjection": 10},
            {"id": 3, "position": "RB", "slot": "Bench", "weekProjection": 20},
            {"id": 4, "position": "WR", "slot": "WR", "weekProjection": 12},
            {"id": 5, "position": "WR", "slot": "Bench", "weekProjection": 15},
            {"id": 6, "position": "WR", "slot": "IR", "weekProjection": 100},
        ]
        points, filled, expected = projected_lineup({"roster": roster}, slots)
        self.assertEqual((points, filled, expected), (57, 4, 4))

    def test_probabilities_are_symmetric(self):
        first = normal_win_probability(135, 120, 25, 28)
        second = normal_win_probability(120, 135, 28, 25)
        self.assertAlmostEqual(first + second, 1)

    def test_historical_playoff_scores_are_excluded_from_variance_training(self):
        league = {
            "currentWeek": 17,
            "playoffSettings": {"regularSeasonWeeks": 14},
            "matchups": [
                {"week": 14, "home": 1, "away": 2, "homeScore": 101, "awayScore": 99},
                {"week": 15, "home": 1, "away": 2, "homeScore": 240, "awayScore": 0},
            ],
        }
        self.assertEqual(completed_scores(league)[1], [(14, 101.0)])

    def test_reseeding_pairs_highest_survivor_with_lowest(self):
        entrants = [1, 3, 5, 8]
        games = []
        def play(home, away):
            games.append((home, away))
            return home, 0, 0
        bracket_round(entrants, play, reseed=True)
        self.assertEqual(games, [(1, 8), (3, 5)])
        games.clear()
        bracket_round(entrants, play, reseed=False)
        self.assertEqual(games, [(1, 3), (5, 8)])

    def test_simulation_is_deterministic_and_ignores_unplayed_scores(self):
        teams = [{"id": number, "name": f"Team {number}", "wins": number % 2, "losses": 1 - number % 2, "ties": 0, "pf": 100 + number * 3, "roster": []} for number in range(1, 9)]
        games = []
        for week in (1, 2):
            for home in (1, 3, 5, 7):
                games.append({"week": week, "home": home, "away": home + 1, "homeScore": 105 + home if week == 1 else 0, "awayScore": 100 + home if week == 1 else 0})
        league = {"leagueId": 1, "season": 2026, "currentWeek": 2, "playoffSettings": {"teamCount": 8, "regularSeasonWeeks": 2}, "teams": teams, "matchups": games, "lineupSlots": {}}
        first = forecast(league, simulations=200)
        self.assertEqual(first, forecast(league, simulations=200))
        changed = copy.deepcopy(league)
        changed["matchups"][-1]["homeScore"] = 1000
        self.assertEqual(first, forecast(changed, simulations=200))
        self.assertAlmostEqual(sum(item["titleChance"] for item in first["teams"].values()), 100, places=2)
        self.assertAlmostEqual(sum(item["expectedFinalWins"] for item in first["teams"].values()), 8, places=2)
        self.assertTrue(all(item["expectedFinalWins"] >= 0 for item in first["teams"].values()))


if __name__ == "__main__":
    unittest.main()
