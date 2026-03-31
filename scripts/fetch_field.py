"""Fetch the tournament field from Data Golf and write data/field.json."""

import json
import os
import sys
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


def fetch_field(tour="pga"):
    resp = requests.get(
        f"{API_BASE}/field-updates",
        params={"tour": tour, "file_format": "json", "key": API_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def build_field_json(raw):
    players = []
    for p in raw.get("field", []):
        players.append({
            "dg_id": p["dg_id"],
            "name": flip_name(p["player_name"]),
            "country": p.get("country", ""),
            "dg_rank": p.get("dg_rank"),
            "owgr_rank": p.get("owgr_rank"),
            "amateur": bool(p.get("am", 0)),
        })
    players.sort(key=lambda x: x.get("dg_rank") or 9999)

    return {
        "event_name": raw.get("event_name", ""),
        "last_updated": raw.get("last_updated", ""),
        "player_count": len(players),
        "players": players,
    }


def main():
    if not API_KEY:
        print("ERROR: DATA_GOLF_API_KEY not set")
        sys.exit(1)

    raw = fetch_field()
    field = build_field_json(raw)

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "field.json")
    with open(out_path, "w") as f:
        json.dump(field, f, indent=2)

    print(f"Wrote {field['player_count']} players for {field['event_name']} to data/field.json")


if __name__ == "__main__":
    main()
