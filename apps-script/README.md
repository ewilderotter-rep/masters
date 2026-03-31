# Apps Script Setup

## 1. Create the Google Sheet

Create a new Google Sheet with these tabs (exact names):

| Tab | Columns (Row 1 headers) |
|---|---|
| **Config** | `key`, `value` |
| **Draft** | `pick_number`, `round`, `player_name`, `dg_id`, `team_owner`, `timestamp` |
| **WeekendPicks** | `team_owner`, `golfer_1_id`, `golfer_2_id`, `golfer_3_id`, `golfer_4_id`, `timestamp` |
| **Field** | `dg_id`, `name`, `country`, `dg_rank`, `owgr_rank` |

## 2. Pre-populate Config tab

| key | value |
|---|---|
| `draft_order` | `["Corey","Eli","Preston","Eric"]` |
| `draft_status` | `not_started` |

## 3. Pre-populate Field tab

Run `scripts/fetch_field.py` locally, then upload the results to the Field tab.
Or use the `upload_field_to_sheet.py` script (TODO).

## 4. Deploy Apps Script

1. Open the Google Sheet > Extensions > Apps Script
2. Replace the default `Code.gs` with the contents of `Code.gs` from this folder
3. Deploy > New deployment > Web app
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the deployment URL
5. Set it as `APPS_SCRIPT_URL` in your `.env` and as a GitHub Secret

## 5. Set draft to active

When ready to draft, change `draft_status` in the Config tab to `active`.
Or POST: `{"action": "set_config", "key": "draft_status", "value": "active"}`
