# Aura — web

Vite + React + Tailwind v4 frontend. Tab capture in the browser,
color extraction in JS, sent to the local Python bridge over HTTP.

The bridge lives at the repo root (`bridge.py`). See the
[top-level README](../README.md).

## Develop

```bash
cd web
npm install
npm run dev
```

Then in another terminal, from the repo root:

```bash
python3 bridge.py
```

Open http://localhost:3000.

`?debug` adds a state-switcher toolbar at the bottom for QA.

## Build

```bash
npm run build
```

Static output → `web/dist/`.

## Deploy on Vercel

Monorepo. In Vercel project settings:

- **Root Directory**: `web`
- **Production Branch**: `main`

Vercel auto-detects Vite from `web/package.json`. Python files at the
repo root are excluded by `.vercelignore`.

## Layout

```
web/
├── public/
│   ├── install.sh         # one-line bridge installer
│   └── uninstall.sh
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx        # state machine + page layout
│   │   └── components/
│   │       ├── Orb.tsx
│   │       ├── InstallBridge.tsx
│   │       ├── RequirementsModal.tsx
│   │       ├── StatusPill.tsx
│   │       └── ThemeContext.tsx
│   ├── lib/
│   │   ├── bridge.ts      # typed client for the local bridge
│   │   └── colors.ts      # chroma²-weighted blend (TS port of video.py)
│   └── styles/
├── index.html             # SEO + meta tags
├── vite.config.ts
└── package.json
```

## State machine

| State          | UI                                    |
|----------------|---------------------------------------|
| `checking`     | Pulsing dot, "Looking for bridge…"    |
| `no-bridge`    | Install modal opens on Start          |
| `no-bulb`      | Warning pill, retry button            |
| `idle`         | Status pill, **Start Aura** button    |
| `picking-tab`  | Disabled button, browser picker open  |
| `running`      | Live orb, BPM badge, metric grid      |
| `error`        | Red pill, retry                       |

The 10 Hz tick loop in `running` mirrors `wiz_ambient/bulb.py` exactly:
`drawImage` → `getImageData` → `extractAuraColor` → eased animator
(color 0.65, brightness 0.80, scene-cut bypass at delta > 90) →
`setBulbColor`.

## Tech

- Vite 6, React 18, TypeScript
- Tailwind v4 (`@tailwindcss/vite`)
- Bebas Neue + Space Mono
