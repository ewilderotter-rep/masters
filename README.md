# Masters Friendship Competition

A 20+ year tradition. Four friends, eight golfers each, one green jacket's worth of bragging rights.

## How It Works

1. **Draft** -- Snake draft (8 rounds, 4 players). Pick your squad from the Masters field.
2. **Thursday & Friday** -- Your best 6 of 8 golfers' total strokes count each round.
3. **The Cut** -- After Friday, pick a 4-man weekend team from golfers who made the cut.
4. **Saturday & Sunday** -- All 4 weekend golfers' strokes count.
5. **Winner** -- Lowest cumulative total strokes. Losers buy steak.

## Participants

- Corey
- Eli
- Preston
- Eric

## Tech

- **Frontend**: Vanilla HTML/CSS/JS + Chart.js, hosted on GitHub Pages
- **Scores**: Data Golf API, polled every 5 min via GitHub Actions
- **Draft & Picks**: Google Apps Script + Sheets backend
- **Standings**: Computed server-side (Python), committed as JSON

## Local Dev

```bash
pip install -r requirements.txt
python scripts/update_data.py          # fetch scores + compute standings
python -m http.server 8000             # serve frontend at localhost:8000
```
