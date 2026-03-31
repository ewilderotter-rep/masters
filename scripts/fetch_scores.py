"""Fetch live tournament scores from Data Golf and write data/live_scores.json."""

import json
import os
import sys
from datetime import datetime, timezone
import requests
from dotenv import load_dotenv

load_dotenv()

API_BASE = "https://feeds.datagolf.com"
API_KEY = os.getenv("DATA_GOLF_API_KEY")


def flip_name(name):
    """Convert 'Last, First' to 'First Last'."""
    if "," in name:
        parts = name.split(",", 1)
        return f"{parts[1].strip()} {parts[0].strip()}"
    return name


def fetch_in_play(tour="pga"):
    resp = requests.get(
        f"{API_BASE}/preds/in-play",
        params={"tour": tour, "file_format": "json", "key": API_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def build_scores_json(raw):
    info = raw.get("info", {})
    players = []
    for p in raw.get("data", []):
        players.append({
            "dg_id": p["dg_id"],
            "name": flip_name(p["player_name"]),
            "country": p.get("country", ""),
            "R1": p.get("R1"),
            "R2": p.get("R2"),
            "R3": p.get("R3"),
            "R4": p.get("R4"),
            "current_score": p.get("current_score"),  # relative to par, cumulative
            "current_pos": p.get("current_pos", ""),
            "today": p.get("today"),                    # relative to par, current round
            "thru": p.get("thru"),
            "round": p.get("round"),
            "make_cut": p.get("make_cut", 0.0),
        })

    return {
        "event_name": info.get("event_name", ""),
        "current_round": info.get("current_round"),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "players": players,
    }


def main():
    if not API_KEY:
        print("ERROR: DATA_GOLF_API_KEY not set")
        sys.exit(1)

    raw = fetch_in_play()
    scores = build_scores_json(raw)

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "live_scores.json")
    with open(out_path, "w") as f:
        json.dump(scores, f, indent=2)

    print(f"Wrote {len(scores['players'])} player scores for {scores['event_name']}")
    return scores


if __name__ == "__main__":
    main()
