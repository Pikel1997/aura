Design a minimal one-page web app called "Aura". It's a tool that turns
  a Philips WiZ smart bulb into ambient lighting that follows whatever's
  playing in a Chrome tab. The page is desktop-first (1440 wide), dark
  mode only, single page with multiple states.

  DESIGN PHILOSOPHY
  ─────────────────
  Restraint over decoration. Think Linear.app, Vercel.com, Fey.com,
  Cron — not Stripe-style marketing pages. The page has ONE focal
  element (a glowing orb that represents the bulb) and everything else
  should feel quiet enough that the orb does the work.

  Avoid: gradient text headlines, glass-morphism card stacks, decorative
  aurora backgrounds, eyebrow pills, "feature card" grids with icons,
  rainbow accents, anything that looks like a SaaS landing page template.

  Aim for: confident negative space, monochrome palette with at most
  one accent color, body text that lives in restrained tones, the orb
  as the only expressive moment.

  STATES (design each as a separate frame or variant)
  ────────────────────────────────────────────────────
  1. IDLE / DEFAULT — bridge running, bulb connected, ready to start
  2. CHECKING BRIDGE — looking for the local bridge process
  3. NO BRIDGE — bridge isn't running, show setup instructions
  4. NO BULB — bridge running but no bulb found, show retry + checklist
  5. PICKING TAB — Chrome tab picker is open (in-page indicator only)
  6. RUNNING — capturing a tab, orb is live, big metrics, stop button
  7. ERROR — bridge dropped mid-session, show recovery

  LAYOUT — All states share this scaffold:

  Top nav (24px padding): "Aura" wordmark on the left, small "GitHub ↗"
  link on the right. No menu, no logo mark. Both should feel almost
  invisible.

  Center: a single vertical stack containing:
    - The orb (~280–320px circle, soft outer glow, core gradient
      from highlight white through the active color to a darker shade)
    - 64px gap
    - Wordmark "Aura" (60–72px, semibold, tight letterspacing, NOT a
      gradient)
    - 12px gap
    - Single tagline below
    - 32–40px gap
    - One primary button OR a status badge depending on state

  Below the fold: a single "One-time setup" section with three numbered
  steps. No card stack, no icons — just numbers, titles, and inline
  monospace command blocks with subtle borders.

  Footer: one line of muted text with the license / open-source note.

  THE ORB
  ───────
  The orb is the page's only expressive element. It should:
  - Be 280–320px in idle state, 360–420px in running state
  - Have a soft outer glow that bleeds into the page background
  - In idle state: a calm violet/blue
  - In running state: shifts to whatever color is currently being sent
    to the bulb (the design just needs to show one or two examples)
  - Subtle inner highlight, never harsh
  - No outline, no border, no animated rings around it

  TYPOGRAPHY
  ──────────
  Use Inter or Geist as the only typeface family. Three sizes total:
  - Title: 60–72px, Semi Bold, tight tracking
  - Body: 16–18px, Regular, line-height 1.5
  - Caption: 11–12px, Medium, slightly increased letter spacing for
    uppercase labels (like "ONE-TIME SETUP")

  Don't introduce more than these three sizes. Don't use a serif font.
  Don't use a gradient on text.

  COLOR
  ─────
  - Background: rich neutral near-black, around #0a0a0c
  - Surface (used sparingly): #16161b
  - Text: off-white, around #f4f4f6
  - Muted text: #8a8a93
  - Subtle text: #5f5f6d
  - One accent: a soft violet (#8060ff territory) used ONLY in:
    - The orb
    - The "connected" status pill
    - Maybe a hairline detail

  Status semantics use system colors at low intensity:
  - Connected/ready: muted green like #30d158 at low opacity
  - Warning (no bulb): muted amber like #ff9f0a at low opacity
  - Error (no bridge): muted red like #ff453a at low opacity

  These show as 1px-bordered pill badges, never filled.

  COPY (use these exact strings)
  ──────────────────────────────
  Title: Aura
  Tagline (idle): Reactive lighting for your screen.
  Tagline (running): Reacting to {tab name}
  CTA button (idle): Start Aura →
  CTA button (no bridge): Start Aura → (disabled)
  Status pill (ready): ● Bulb connected · {ip}
  Status pill (checking): ● Looking for the local bridge…
  Status pill (no bulb): ● Bridge running, no bulb found · Retry
  Status pill (no bridge): ● Bridge not running · See setup below
  Stop button (running): ⏻ Stop
  Footer: Open source under MIT.

  Setup section heading (small caps): ONE-TIME SETUP
  Setup section title: Run the local bridge
  Setup blurb: WiZ bulbs only speak to your local network. A small
    Python script forwards commands from this page to your bulb. You
    only need to run it once per session.
  Step 1 title: Clone the repo
  Step 1 code: git clone https://github.com/Pikel1997/aura.git && cd aura
  Step 2 title: Run the bridge
  Step 2 code: python3 bridge.py
  Step 3 title: Come back and start
  Step 3 code: (no command — just text "Click Start Aura above.")

  RUNNING STATE LAYOUT
  ────────────────────
  When the user is capturing a tab:
  - The orb grows slightly and dominates the screen
  - Below the orb: small uppercase label "REACTING TO" + the tab name
    in larger text below it
  - Below that: a tiny grid of 6 metrics in monospace, two rows of
    three: R / G / B on top, BRI / LUM / CHR underneath. Each metric
    is just a label (10pt uppercase muted) and a value (12pt mono).
    No bars, no progress indicators — they're noisy.
  - Stop button at the bottom, pill style, outlined not filled

  DELIVERABLE
  ───────────
  Generate ONE Figma file with ~7 frames (one per state) at 1440×900,
  all using a shared component for the orb + nav + footer. Use auto-
  layout aggressively so the states share spacing.

  Do not add a phone/tablet variant — desktop only.
  Do not add a marketing footer with social links.
  Do not add testimonials, FAQ, or pricing.
  Do not add a navigation menu beyond Aura wordmark + GitHub link.
