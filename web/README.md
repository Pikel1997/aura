# Aura — web frontend

Vite + React + Tailwind v4 single-page app. The whole experience runs
client-side: tab capture via `getDisplayMedia`, color extraction in JS
(`src/lib/colors.ts`), sent to a local Python bridge over HTTP at
`http://127.0.0.1:8787`.

The bridge is in the repo root (`bridge.py`) and is what each user runs
on their own machine — see the top-level [`README.md`](../README.md).

## Develop

```bash
cd web
npm install
npm run dev
```

Then in a separate terminal, from the repo root:

```bash
python3 bridge.py
```

Open <http://localhost:3000>. The page should auto-detect the local
bridge and show *Bulb connected*. Click **Start Aura**, pick a tab,
the bulb should follow it.

A debug state-switcher is hidden behind `?debug` — visit
<http://localhost:3000/?debug> to get a bottom toolbar that lets you
flip between every state (`idle`, `no-bridge`, `no-bulb`, `running`, …)
without actually triggering them. Useful for screenshots and visual
QA.

## Build

```bash
npm run build
```

Outputs static files to `web/dist/`.

## Deploy on Vercel

This repo is a monorepo. When importing the project on Vercel, set:

- **Root Directory**: `web`
- **Production Branch**: `main`

That's the only configuration needed. Vercel auto-detects Vite from
`web/package.json` and runs `vite build` → static output. The Python
bridge files at the repo root are excluded from the Vercel build by
the `.vercelignore` at the repo root.

The deployed page does **not** have any backend — it's a fully static
client app. Bulb control happens via each user's local bridge, not a
Vercel server, by design (browsers can't speak UDP and serverless
can't reach a LAN device).

## Project layout

```
web/
├── public/
│   ├── install.sh         ← one-line bridge installer (curl piped to bash)
│   └── uninstall.sh       ← one-line bridge uninstaller
├── src/
│   ├── main.tsx           ← Vite entry
│   ├── app/
│   │   ├── App.tsx        ← top-level state machine + page layout
│   │   └── components/
│   │       ├── Orb.tsx           ← the glowing focal element
│   │       ├── InstallBridge.tsx ← curl + Copy + auto-poll panel
│   │       ├── StatusPill.tsx    ← state pill (connected / no-bridge / …)
│   │       ├── ThemeContext.tsx  ← light/dark theme provider
│   │       ├── GrainOverlay.tsx  ← film-grain overlay
│   │       ├── CropMarks.tsx     ← architectural crop marks
│   │       └── SetupSection.tsx  ← (legacy, not imported)
│   ├── lib/
│   │   ├── bridge.ts      ← typed client for the local Python bridge
│   │   └── colors.ts      ← chroma²-weighted blend (TS port of video.py)
│   └── styles/
│       ├── index.css      ← Tailwind v4 entry
│       ├── theme.css      ← color tokens
│       ├── tailwind.css   ← @theme directives
│       └── fonts.css      ← Bebas Neue + Space Mono
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## State machine

`App.tsx` walks through these states:

| State          | Trigger                                  | UI                                 |
|----------------|------------------------------------------|------------------------------------|
| `checking`     | Initial mount — pinging the bridge       | Pulsing dot, "Looking for bridge…" |
| `no-bridge`    | Bridge HTTP unreachable                  | Install panel, polling indicator   |
| `no-bulb`      | Bridge alive but no bulb discovered      | Warning pill, retry button         |
| `idle`         | Bridge alive and connected to a bulb     | Status pill, **Start Aura** button |
| `picking-tab`  | After Start, while Chrome picker is open | Disabled button, "Waiting for picker…" |
| `running`      | Stream active, ticking                   | Live orb, metric grid, **Stop**    |
| `error`        | Bridge dropped mid-session               | Red pill, retry button             |

The 10 Hz tick loop in the `running` state mirrors the Python
`BulbController` exactly: `drawImage` → `getImageData` → `extractAuraColor`
→ eased animator (color 0.65, brightness 0.8, scene-cut bypass at
delta > 90) → `setBulbColor`.

## Tech

- **Vite 6** + **React 18** + **TypeScript**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **motion** (Framer Motion) — used sparingly, mostly for AnimatePresence
- **Bebas Neue** (display) + **Space Mono** (UI / code)
- A handful of **shadcn/ui** primitives in `src/app/components/ui/`,
  most unused but kept around because Figma Make pulled them in
