# Design System

A single-canvas interface for a media conversion tool. The UI should feel like a carefully built instrument — every element earns its place.

## 1. Philosophy

- **One surface, not many cards.** The interface is a single canvas that transforms through states. Never show multiple panels or columns for what is fundamentally a linear flow.
- **Progressive disclosure.** Only show what's relevant to the current moment. The user sees the drop zone, then the preview with format choices, then the result. Never all three at once.
- **Earn every pixel.** If an element doesn't serve the current state, it doesn't exist. No placeholder panels, no disabled sections waiting their turn.
- **Immediate feedback.** Every action produces a visible response. Drop a file — see it. Pick a format — conversion starts. Done — play it.

## 2. Personality

- **Tone**: precise, confident, quiet. The app does one thing and does it exceptionally well.
- **Geometry**: soft rectangles (`radius-md` to `radius-xl`). Rounded enough to feel modern, square enough to feel serious.
- **Density**: generous whitespace. Let the content breathe. The canvas is centered and narrow (`max-w-[540px]`), not stretched edge-to-edge.
- **Motion**: purposeful. Entry animations orient the user. Progress indicators communicate activity. Nothing decorates.

## 3. Color Tokens

OKLCH neutrals with a single green accent (FFmpeg green, hue ~145). Color is functional, never decorative.

### Surfaces

- `page`: app background — the darkest layer.
- `surface`: canvas and panel fill.
- `elevated`: raised interactive elements (pills, icons).
- `void`: near-black for media containers and video backgrounds.

### Text

- `ink`: primary text — high contrast.
- `ink-secondary`: supporting text and secondary labels.
- `ink-muted`: metadata, placeholders, tertiary info.
- `ink-inverted`: text on accent-filled backgrounds.

### Borders

- `stone`: default structural borders.
- `stone-strong`: emphasized borders, pill outlines.

### Accent and status

- `accent` / `accent-hover` / `accent-soft`: primary actions, focus states, active indicators.
- `success` / `success-soft`: positive deltas, completed states.
- `error` / `error-soft`: failure states, validation errors.
- `signal` / `signal-soft`: non-critical warnings, size increases.
- `info` / `info-soft`: neutral informational states.

## 4. Typography

- **Font**: `Geist Mono Variable` for everything — UI, data, labels. Monospace communicates precision.
- **Hierarchy**: achieved through size and weight only. Never a second typeface.
- **Scale**: `11px` labels / `12-13px` metadata / `14px` body / `28-32px` page title.
- **Letter spacing**: `tracking-widest` on uppercase micro-labels, subtle `0.01em` on body.

## 5. Layout

- **Single centered column.** The canvas lives at `max-w-[540px]`, centered vertically and horizontally.
- **The canvas IS the interface.** There's no sidebar, no secondary panel, no dashboard grid. One surface that morphs.
- **Spacing rhythm**: `8 / 12 / 16 / 24` internally. Generous padding around the canvas itself.
- **Responsive**: the canvas naturally adapts — it's already narrow. Mobile gets tighter padding, nothing else changes structurally.

## 6. Surfaces and Depth

- **Borders over shadows.** Thin `1px` borders define surfaces. Shadows are rare and subtle (only on hover micro-interactions like format pills).
- **Radius**: `radius-md` (0.45rem) for inner elements, `radius-xl` (1rem) for the canvas and major containers.
- **Gradients**: only functional — the overlay gradient on video previews (`from-void/90 to-transparent`) to ensure text readability over video content.
- **Backdrop blur**: sparingly, on floating interactive elements like format pills.

## 7. Components

### Drop zone (idle state)
- Dashed border, centered vertically in the viewport.
- Upload icon in a circular elevated container.
- Two lines of text: action ("Drop a video file") + alternative ("or click to browse").
- On drag: border becomes accent, background tints, subtle scale-up (`1.01`).

### Video preview (input ready)
- Full-width `aspect-video` in a `void` container with `radius-xl`.
- File info overlaid at bottom with gradient fade — filename, size, "Change" action.
- No chrome around the video. The video IS the interface at this point.

### Format picker
- Centered row of pills below the preview.
- Micro-label above: "CONVERT TO" in `11px` uppercase tracking-widest.
- Each pill: `elevated` background, `stone-strong` border, `radius-md`.
- On hover: border becomes accent, background becomes accent-soft, subtle lift (`translateY(-1px)`) with soft shadow.
- Clicking a pill immediately starts conversion — no separate "Go" button.

### Processing state
- Same video preview, dimmed to `opacity-40`.
- Spinner + label ("Converting to MP4") centered over the dimmed preview.
- Thin progress bar below (`3px` height, `accent` fill, animated width).

### Result state
- Output media in the same container, with `accent/30` border to subtly signal completion.
- Inline stats below: "X MB in → Y MB out · -Z%" — all on one line, centered.
- Action row: Download (primary), Convert again (ghost), New file (ghost).

### Error state
- Single rounded container with `error/40` border and `error-soft/30` background.
- Error message centered. "Start over" button below.

## 8. Interaction Patterns

- **Drag and drop is primary.** The entire canvas is a drop target. Click-to-browse is the fallback.
- **Format selection = action.** Picking a format immediately triggers conversion. No confirmation step. This is the key UX decision — it removes an entire interaction from the flow.
- **State transitions are total.** The canvas doesn't partially update. It fully transitions between states. This prevents visual clutter from accumulating.
- **"Change" over "Reset".** When a file is loaded, the user can "Change" it — language implies refinement, not starting over.

## 9. Motion

- **Entry**: upward fade (`rise-in`, ~500ms, custom ease).
- **Hover**: color/border transitions at 180ms. Format pills get a 120ms lift.
- **Progress**: smooth width transition on the progress bar. Spinner at standard 0.9s rotation.
- **`prefers-reduced-motion`**: all animations collapse to 1ms except the spinner (functional indicator).

## 10. Accessibility

- AA contrast minimum for all text and interactive elements.
- `2px` solid accent focus outlines with `2px` offset on all focusable controls.
- File input is `sr-only` but fully keyboard accessible via the label.
- Never rely on color alone — error states have text, success has download action, progress has spinner + label.
- Video previews are non-autoplaying in preview state. Autoplay only on result (user-initiated conversion).

## 11. Implementation

- Tokens live in `apps/web/src/index.css` via Tailwind `@theme`.
- Reusable classes: `btn-primary`, `btn-ghost`, `format-pill`, `canvas`, `reveal`.
- State management drives rendering — each `WorkflowStage` maps to exactly one visual state of the canvas.
- No component library beyond `@base-ui/react` primitives where needed. Most elements are plain HTML with Tailwind classes.
