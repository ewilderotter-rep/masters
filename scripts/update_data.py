"""Orchestrator: fetch scores, read teams from Apps Script, compute standings.

This is the entry point for GitHub Actions cron job.
"""

import json
import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

# Add scripts dir to path
sys.path.insert(0, os.path.dirname(__file__))

from fetch_scores import fetch_in_play, build_scores_json
from compute_standings import (
    build_score_lookup,
    compute_standings,
    build_standings_json,
    append_history,
    save_standings,
    load_config,
    DATA_DIR,
)

APPS_SCRIPT_URL = os.getenv("APPS_SCRIPT_URL")


def fetch_teams_from_apps_script():
    """Fetch draft picks + weekend teams from Apps Script (source of truth)."""
    if not APPS_SCRIPT_URL:
        print("WARNING: APPS_SCRIPT_URL not set, checking for local fallback")
        return load_local_teams_fallback()

    resp = requests.get(
        APPS_SCRIPT_URL,
        params={"action": "teams"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_weekend_teams_from_apps_script():
    """Fetch weekend team selections from Apps Script."""
    if not APPS_SCRIPT_URL:
        return {}

    resp = requests.get(
        APPS_SCRIPT_URL,
        params={"action": "weekend_state"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def load_local_teams_fallback():
    """Fallback: load teams from a local JSON file for testing without Apps Script."""
    path = os.path.join(DATA_DIR, "teams_local.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    print("WARNING: No teams data available (no Apps Script URL and no local fallback)")
    return {}


def merge_teams_with_weekend(teams_data, weekend_data):
    """Mark which golfers are on the weekend team.

    Args:
        teams_data: {"teams": {"Corey": [{"dg_id": 123, "name": "..."}, ...], ...}}
        weekend_data: {"weekend_teams": {"Corey": [dg_id1, dg_id2, ...], ...}}

    Returns:
        dict of {owner: [{dg_id, name, is_weekend}, ...]}
    """
    teams = teams_data.get("teams", teams_data)
    weekend_teams = weekend_data.get("weekend_teams", {})

    merged = {}
    for owner, golfers in teams.items():
        weekend_ids = set(weekend_teams.get(owner, []))
        merged[owner] = []
        for g in golfers:
            merged[owner].append({
                **g,
                "is_weekend": g["dg_id"] in weekend_ids if weekend_ids else False,
            })

    return merged


def main():
    config = load_config()
    if not config:
        print("ERROR: data/config.json not found")
        sys.exit(1)

    # Step 1: Fetch live scores from Data Golf
    print("Fetching live scores from Data Golf...")
    api_key = os.getenv("DATA_GOLF_API_KEY")
    if not api_key:
        print("ERROR: DATA_GOLF_API_KEY not set")
        sys.exit(1)

    raw_scores = fetch_in_play()
    live_scores = build_scores_json(raw_scores)

    scores_path = os.path.join(DATA_DIR, "live_scores.json")
    with open(scores_path, "w") as f:
        json.dump(live_scores, f, indent=2)
    print(f"  {len(live_scores['players'])} players, event: {live_scores['event_name']}")

    # Step 2: Fetch teams from Apps Script
    print("Fetching teams from Apps Script...")
    teams_data = fetch_teams_from_apps_script()
    if not teams_data:
        print("  No teams data -- standings will be empty")
        save_standings(build_standings_json([], live_scores, config))
        return

    # Step 3: Fetch weekend teams (if applicable)
    print("Fetching weekend teams...")
    weekend_data = fetch_weekend_teams_from_apps_script()

    # Step 4: Merge teams + weekend selections
    teams = merge_teams_with_weekend(teams_data, weekend_data)
    print(f"  {len(teams)} teams loaded")

    # Step 5: Compute standings
    print("Computing standings...")
    score_lookup = build_score_lookup(live_scores)
    current_round = live_scores.get("current_round") or 1
    standings = compute_standings(teams, score_lookup, config, current_round)

    # Step 6: Save standings + append history
    standings_json = build_standings_json(standings, live_scores, config)
    save_standings(standings_json)
    append_history(standings)

    print("Done!")
    for s in standings:
        print(f"  #{s['rank']} {s['name']}: {s['total_strokes']} strokes ({'+' if s['strokes_behind'] else ''}{s['strokes_behind']} behind)")


if __name__ == "__main__":
    main()
