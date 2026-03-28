# LAX EDGE v3.0

NCAA D1 Men's Lacrosse matchup predictor, daily picks, and rankings.

## Features
- **Today's Slate** — daily game schedule with model predictions
- **Predictor** — head-to-head matchup analysis for any two teams
- **Rankings** — official USA Lacrosse Top 20

## Data Pipeline
- Team stats scraped from NCAA.com (Wednesdays)
- Game schedule scraped daily
- Rankings scraped from USA Lacrosse (Wednesdays)
- All data stored in Vercel KV

## Deploy
1. Push to GitHub
2. Connect to Vercel
3. Add Vercel KV store
4. Trigger initial data load via `/api/cron/stats`, `/api/cron/schedule`, `/api/cron/rankings`
