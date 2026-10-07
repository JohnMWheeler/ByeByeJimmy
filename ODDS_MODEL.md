# Bye-Bye Jimmy forecast model, version 1

The displayed odds now come from a repeatable forecast, calculated whenever ESPN data refreshes. They are **fair model prices**, not betting lines or ESPN's own odds. No sportsbook margin is added.

## Weekly score forecasts

- Completed team scores provide a season average and a recency-weighted average. More recent weeks receive weight `0.65^age`. A future-week baseline is `0.55 × recent average + 0.25 × season average + 0.20 × league average`.
- For the current week, the model selects each roster's highest-projected *legal* lineup using ESPN player projections. The league currently starts 1 QB, 2 RB, 2 WR, 1 TE, 2 flex players, 1 D/ST, and 1 K. Bench players can be selected; IR and players marked out are excluded. If a roster cannot fill a slot, the model imputes a league-average replacement score. It blends the lineup projection with the team baseline, weighting projections up to 60% when all slots are covered.
- Each team's score spread comes from its completed regular-season weekly scores, shrunk toward the pooled league spread because only a few weeks have been played. The standard deviation is bounded between 18 and 45 points. Once past seasons are imported, 30% of the pooled league variance estimate comes from those seasons; playoff scores are excluded because multi-week playoff matchups may report combined totals. Scores are modeled as independent normal draws, with negative draws floored at zero.
- Weekly win probability is the probability that one forecast score exceeds the other. Current-week games use roster projections; later weeks use the team baselines. Probabilities are converted to fair American moneylines.

## Championship futures

The model runs **30,000 deterministic simulations** of the remaining regular-season games and playoffs. It starts with ESPN's current records and points for. It simulates the 14-week regular season, seeds the top eight by wins and then points scored, and plays an eight-team bracket using the league's ESPN reseeding setting (currently off). Each team's title probability is the fraction of simulations it wins, with a small half-count smoothing term so a zero-win simulation is displayed as an unpriced longshot instead of certain elimination.

The Analytics page also shows **Projected W**: a team's average final regular-season win total across those same simulations, including wins already earned. It is displayed to two decimal places, so fractional expected wins are retained. Existing ESPN ties count as half a win. This predictive number differs from **All-play EW**, which summarizes only completed weeks by comparing each score against the whole league.

This seeding rule is an approximation of ESPN's full tiebreaker settings. The forecast also assumes managers fill competitive legal lineups and that future roster strength follows recent scoring. No trade, waiver, injury, or correlated NFL-game scenario is simulated yet. Its independent weekly score draws also omit persistent uncertainty about each team's underlying strength; the futures should therefore be treated as exploratory rather than calibrated prices.

## American odds

For a probability `p` between 0 and 1, fair odds are:

- `+100 × (1 − p) / p` when `p < 0.5`;
- `−100 × p / (1 − p)` when `p > 0.5`;
- `+100` when `p = 0.5`.

The display rounds to the nearest five. A title probability below 0.1% is shown as `<0.1%` with no moneyline because 30,000 runs cannot price such a rare event reliably.

## Validation and next improvements

The model passes checks for probability symmetry, title probabilities summing to 100%, repeatability, legal-lineup selection, and exclusion of unplayed scores from training. It has **not** been calibrated or backtested against previous Bye-Bye Jimmy seasons because ESPN denied anonymous access to 2022–2025. Those seasons can be imported later. A proper backtest should use only pregame information, compare log loss and Brier score with a simple season-average baseline, and inspect calibration by probability band before any odds are treated as dependable.
