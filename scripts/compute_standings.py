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


def compute_team_score(team_golfers, score_lookup, config, current_round=1):
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

    # Thu/Fri: best 6 of 8 per round (includes in-progress estimated scores)
    for rnd in ["R1", "R2"]:
        rnd_num = int(rnd[1])
        round_scores = []
        for detail in golfer_details:
            strokes = detail.get(rnd)
            if strokes is not None:
                # Completed round
                round_scores.append((detail["dg_id"], strokes))
            elif detail.get("round") == rnd_num and detail.get("thru", 0) > 0:
                # In-progress: estimate as PAR + today
                est = PAR + (detail.get("today") or 0)
                round_scores.append((detail["dg_id"], est))
            elif rnd_num <= current_round and detail.get("current_pos") != "CUT":
                # Not yet started but round is active: estimate as PAR
                round_scores.append((detail["dg_id"], PAR))

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
    in_progress_total = 0
    for detail in golfer_details:
        current_round = detail.get("round")
        if current_round is None:
            continue
        rnd_key = f"R{current_round}"
        if detail.get(rnd_key) is None and detail.get("thru", 0) > 0:
            if rnd_key in ("R1", "R2"):
                est_strokes = PAR + (detail.get("today") or 0)
                detail[f"{rnd_key}_est"] = est_strokes
            elif rnd_key in ("R3", "R4") and detail["dg_id"] in weekend_ids:
                est_strokes = PAR + (detail.get("today") or 0)
                detail[f"{rnd_key}_est"] = est_strokes
                in_progress_total += est_strokes

    # ── vs Par ────────────────────────────────────────────────────────────────
    # For each completed round, compute counting golfers' total vs par.
    # R1/R2: counting golfers vary; use round_totals - (n_counting * PAR)
    # R3/R4: weekend golfers; use round_totals - (n_weekend * PAR)
    vs_par_by_round = {}
    for rnd in ["R1", "R2"]:
        if round_totals.get(rnd):
            n_counting = sum(1 for d in golfer_details if d["counting"].get(rnd))
            vs_par_by_round[rnd] = round_totals[rnd] - (n_counting * PAR)
    for rnd in ["R3", "R4"]:
        if round_totals.get(rnd):
            # Only count golfers who have actually completed this round
            n_counting = sum(1 for d in golfer_details if d["dg_id"] in weekend_ids and d.get(rnd) is not None)
            if n_counting > 0:
                vs_par_by_round[rnd] = round_totals[rnd] - (n_counting * PAR)

    # In-progress vs par for current round (R3/R4 only — R1/R2 already in vs_par_by_round)
    inprogress_vs_par = 0
    for detail in golfer_details:
        current_round = detail.get("round")
        if current_round is None:
            continue
        rnd_key = f"R{current_round}"
        if rnd_key in ("R1", "R2"):
            continue  # already included via round_totals
        if detail.get(rnd_key) is None and detail.get("thru", 0) > 0:
            if detail["counting"].get(rnd_key) or detail["dg_id"] in weekend_ids:
                inprogress_vs_par += (detail.get("today") or 0)

    team_vs_par = sum(vs_par_by_round.values()) + inprogress_vs_par

    # ── Holes Remaining ───────────────────────────────────────────────────────
    # For each counting golfer: holes left in current round + 18 per future round.
    # For R1/R2 golfers: count rounds 1-2. For weekend golfers: count rounds 3-4.
    team_holes_remaining = 0
    for detail in golfer_details:
        if detail["current_pos"] == "CUT":
            detail["holes_remaining"] = 0
            continue

        current_round = detail.get("round") or 1
        thru = detail.get("thru") or 0
        holes_left_this_round = max(0, 18 - thru) if detail.get(f"R{current_round}") is None else 0

        is_weekend = detail["dg_id"] in weekend_ids
        # Which rounds does this golfer still count in?
        if is_weekend:
            future_rounds = [r for r in [3, 4] if r > current_round]
        else:
            future_rounds = [r for r in [1, 2] if r > current_round]

        detail["holes_remaining"] = holes_left_this_round + len(future_rounds) * 18

        # Only add to team total if they're a counting golfer
        if any(detail["counting"].values()) or is_weekend:
            team_holes_remaining += detail["holes_remaining"]

    return {
        "total_strokes": team_total + in_progress_total,
        "round_totals": round_totals,
        "vs_par": team_vs_par,
        "vs_par_by_round": vs_par_by_round,
        "holes_remaining": team_holes_remaining,
        "golfers": golfer_details,
    }


def compute_standings(teams, score_lookup, config, current_round=1):
    """Compute standings for all teams.

    Args:
        teams: dict of {owner_name: [{"dg_id": int, "name": str, "is_weekend": bool}, ...]}
        score_lookup: dict of {dg_id: player_score_data}
        config: config.json contents
        current_round: active round number (1-4)
    """
    results = []
    for owner, golfers in teams.items():
        team_result = compute_team_score(golfers, score_lookup, config, current_round)
        results.append({
            "name": owner,
            "color": config["participants"].get(owner, {}).get("color", "#333"),
            "total_strokes": team_result["total_strokes"],
            "round_totals": team_result["round_totals"],
            "vs_par": team_result["vs_par"],
            "vs_par_by_round": team_result["vs_par_by_round"],
            "holes_remaining": team_result["holes_remaining"],
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

    # Guard: refuse to append empty score snapshot if previous had data
    if not snapshot["scores"]:
        if history and history[-1].get("scores"):
            print("ERROR: score snapshot is empty while previous snapshot had data; skipping history append")
            return False

    history.append(snapshot)

    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)
    return True


def save_standings(standings_json):
    out_path = os.path.join(DATA_DIR, "standings.json")

    # Guard: refuse to overwrite non-empty standings with an empty result
    if not standings_json.get("standings"):
        if os.path.exists(out_path):
            with open(out_path) as f:
                prev = json.load(f)
            if prev.get("standings"):
                print("ERROR: standings computation returned empty results; keeping previous standings")
                return False

    with open(out_path, "w") as f:
        json.dump(standings_json, f, indent=2)
    return True
