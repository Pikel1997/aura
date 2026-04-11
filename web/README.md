# Aura — web

Next.js + Tailwind + Framer Motion frontend for Aura. Pure browser
client-side: tab capture via `getDisplayMedia`, color extraction in JS,
posts results to a local Python bridge that controls the WiZ bulb.

## Develop

```bash
cd web
npm install
npm run dev
```

Then run the bridge from the repo root in a separate terminal:

```bash
python bridge.py
```

Open http://localhost:3000.

## Deploy on Vercel

This is a monorepo. When importing the project on Vercel, set the
**Root Directory** to `web/` and Vercel will auto-detect Next.js. The
`vercel.json` at the repo root pre-configures this.

The deployed page only does tab capture and color extraction in the
user's browser. Bulb control happens via the local Python bridge each
user runs on their own machine — there is no Vercel server involvement
in the bulb control path, by design (browsers can't speak UDP and
serverless can't reach a LAN device).
