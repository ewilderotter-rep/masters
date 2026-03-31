"""Compute team standings from live scores + draft picks.

Source of truth:
- Draft picks / weekend teams: Apps Script API (Google Sheet)
- Scores: Data Golf API (live_scores.json)
- Standings: computed here, written to standings.json + history.json
"""

import json
import os
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
PAR = 72


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def load_config():
    return load_json("config.json")


def build_score_lookup(live_scores):
    """Map dg_id -> player score data."""
    return {p["dg_id"]: p for p in live_scores.get("players", [])}


def compute_round_strokes(player_score, round_key):
    """Get actual strokes for a completed round, or None."""
    return player_score.get(round_key)


def compute_team_score(team_golfers, score_lookup, config):
    """Compute a team's total score across all rounds played so far.

    Thu/Fri (R1, R2): best 6 of 8 count per round
    Sat/Sun (R3, R4): all 4 weekend team golfers count per round
    """
    rounds_config = config["rounds"]
    team_total = 0
    golfer_details = []
    round_totals = {}

    for golfer in team_golfers:
        dg_id = golfer["dg_id"]
        scores = score_lookup.get(dg_id, {})
        detail = {
            "dg_id": dg_id,
            "name": golfer.get("name", scores.get("name", "Unknown")),
            "R1": scores.get("R1"),
            "R2": scores.get("R2"),
            "R3": scores.get("R3"),
            "R4": scores.get("R4"),
            "current_pos": scores.get("current_pos", ""),
            "current_score": scores.get("current_score"),
            "today": scores.get("today"),
            "thru": scores.get("thru"),
            "round": scores.get("round"),
            "make_cut": scores.get("make_cut", 0.0),
            "counting": {},
            "is_weekend": golfer.get("is_weekend", False),
        }
        golfer_details.append(detail)

    # Thu/Fri: best 6 of 8 per round
    for rnd in ["R1", "R2"]:
        round_scores = []
        for detail in golfer_details:
            strokes = detail.get(rnd)
            if strokes is not None:
                round_scores.append((detail["dg_id"], strokes))

        round_scores.sort(key=lambda x: x[1])
        best_6 = round_scores[:6]
        counting_ids = {s[0] for s in best_6}

        rnd_total = sum(s[1] for s in best_6)
        round_totals[rnd] = rnd_total
        team_total += rnd_total

        for detail in golfer_details:
            detail["counting"][rnd] = detail["dg_id"] in counting_ids

    # Sat/Sun: weekend team only (all count)
    weekend_ids = {g["dg_id"] for g in team_golfers if g.get("is_weekend")}
    for rnd in ["R3", "R4"]:
        rnd_total = 0
        for detail in golfer_details:
            strokes = detail.get(rnd)
            if detail["dg_id"] in weekend_ids and strokes is not None:
                rnd_total += strokes
                detail["counting"][rnd] = True
            elif detail["dg_id"] in weekend_ids:
                detail["counting"][rnd] = True  # will count once played
            else:
                detail["counting"][rnd] = False

        round_totals[rnd] = rnd_total
        team_total += rnd_total

    # In-progress round estimation: add current round strokes for counting golfers
    # This handles the case where R[n] is null but the golfer is actively playing
    in_progress_total = 0
    for detail in golfer_details:
        current_round = detail.get("round")
        if current_round is None:
            continue
        rnd_key = f"R{current_round}"
        # If the round score is null but they have thru > 0, they're in progress
        if detail.get(rnd_key) is None and detail.get("thru", 0) > 0:
            # Check if this golfer should be counting
            if rnd_key in ("R1", "R2"):
                # We can't know if they'll be top 6 until they finish
                # Use today (relative to par) + par as estimated strokes
                est_strokes = PAR + (detail.get("today") or 0)
                detail[f"{rnd_key}_est"] = est_strokes
            elif rnd_key in ("R3", "R4") and detail["dg_id"] in weekend_ids:
                est_strokes = PAR + (detail.get("today") or 0)
                detail[f"{rnd_key}_est"] = est_strokes
                in_progress_total += est_strokes

    return {
        "total_strokes": team_total + in_progress_total,
        "round_totals": round_totals,
        "golfers": golfer_details,
    }


def compute_standings(teams, score_lookup, config):
    """Compute standings for all teams.

    Args:
        teams: dict of {owner_name: [{"dg_id": int, "name": str, "is_weekend": bool}, ...]}
        score_lookup: dict of {dg_id: player_score_data}
        config: config.json contents
    """
    results = []
    for owner, golfers in teams.items():
        team_result = compute_team_score(golfers, score_lookup, config)
        results.append({
            "name": owner,
            "color": config["participants"].get(owner, {}).get("color", "#333"),
            "total_strokes": team_result["total_strokes"],
            "round_totals": team_result["round_totals"],
            "golfers": team_result["golfers"],
        })

    results.sort(key=lambda x: x["total_strokes"])
    leader = results[0]["total_strokes"] if results else 0

    for i, r in enumerate(results):
        r["rank"] = i + 1
        r["strokes_behind"] = r["total_strokes"] - leader

    return results


def build_standings_json(standings, live_scores, config):
    return {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "event_name": live_scores.get("event_name", config.get("tournament", "")),
        "current_round": live_scores.get("current_round"),
        "par": PAR,
        "standings": standings,
    }


def append_history(standings):
    """Append current standings snapshot to history.json for the chart."""
    history_path = os.path.join(DATA_DIR, "history.json")
    history = []
    if os.path.exists(history_path):
        with open(history_path) as f:
            history = json.load(f)

    snapshot = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scores": {s["name"]: s["total_strokes"] for s in standings},
    }
    history.append(snapshot)

    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)


def save_standings(standings_json):
    out_path = os.path.join(DATA_DIR, "standings.json")
    with open(out_path, "w") as f:
        json.dump(standings_json, f, indent=2)
