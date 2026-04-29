# Cash Flow

Private offline-first money manager. Vite + React. Data lives in browser localStorage.

## What's new in v0.2

- **Light & dark themes** with auto-follow-system option (Settings → Appearance)
- **Privacy mode** — eye icon top-right blurs all amounts so you can show the app in public
- **Sage green + slate blue palette** — designed to feel balanced rather than clinical
- **5-tab navigation** with Calendar elevated to its own full-screen page in the middle
- **Multi-earner support** — add a second earner (your partner) and tag income to them; tax calculated independently per earner per tax year
- **Salary entity** for regular employed PAYE income (annual gross + frequency, app generates pay events automatically)
- **Per-earner tax cards** on Activity page showing each person's Malta and PAYE position separately
- **Bigger calendar cells** with stacked event bars (multiple bills show as multiple bars, not a single dot)
- **Chunkier weekly bars** on the Budget chart with callout labels on the largest bills
- **Tax simplified** to two modes — Malta (gross with service charge) and PAYE (cumulative)

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. From your phone on the same WiFi: `http://<your-laptop-IP>:5173`.

## Build & deploy

```bash
npm run build
```

Outputs static site in `dist/`. Deploy anywhere.

### GitHub Pages with Actions

1. Push to GitHub.
2. Settings → Pages → Source: **GitHub Actions** (this is the key thing — not "Deploy from branch").
3. Add `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

Push, watch the Actions tab go green, visit `https://yourname.github.io/cashflow/`.

## Multi-earner

By default there's one earner ("You"). To add a partner:
- Settings → Earners → + Add → enter their name.
- Now Job, Salary and External Income forms show a "For" toggle.
- Activity page shows a separate tax-year card per earner.

PAYE cumulative tracking is independent per earner. Each person has their own personal allowance, NI thresholds, and cumulative position. Malta jobs (yours) and salary income (hers) never cross-contaminate.

## Tax notes

**Malta** = gross income with a service charge % deducted. No UK tax/NI at source. Class 2 NI (~£179/yr) is voluntary at year end and shown on the Activity page tax card.

**PAYE** = full HMRC cumulative Income Tax + Class 1 NI. Each pay period's deduction reflects the cumulative position to date. Salary and PAYE jobs from the same earner combine into a single cumulative stream. Personal allowance tapers above £100k.

Bands (2024-25 / 2025-26 frozen): PA £12,570, basic 20% to £50,270, higher 40% to £125,140, additional 45%. NI 8% £12,570–£50,270, 2% above. Update `src/lib/tax.js` if these change.

## Privacy

All data stays in browser localStorage under `cashflow_v3`. To share with your partner: Settings → Export → JSON file → send → they Import on their device.

## Project structure

```
src/
  App.jsx
  main.jsx
  styles.css
  hooks/useStoredData.js
  lib/
    format.js
    tax.js
    projection.js
    theme.js               palette + system pref handling
    ThemeContext.jsx       theme provider
    styles.js              styles as a function of theme
  components/
    Home.jsx
    Activity.jsx
    CalendarPage.jsx
    Budget.jsx
    Wealth.jsx
    TrajectoryChart.jsx
    Modal.jsx
    Nav.jsx
    atoms.jsx
```
