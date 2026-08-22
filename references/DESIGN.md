# career

## Context And Goals
Aman Agent Lab must use a career-ops-inspired marketing canvas: editorial, open-source, warm, dotted, and implementation-first. The page should still use the installed Magic UI components, but every section must feel like part of the same ivory/orange printed interface rather than a blue SaaS template.

## Design Tokens And Foundations
- Product/brand: Aman Agent Lab.
- Reference style: https://career-ops.org/.
- Product surface: AI agent lab landing page for chat, PDFs, memory, retrieval, and developer workflows.
- Visual style: printed terminal canvas, orange halftone sun, dotted paper fields, quiet cards, precise spacing, restrained motion.
- Font primary: `DM Sans` via `--font-dm-sans`.
- Font display: `Space Grotesk` via `--font-space-grotesk`.
- Font mono: `Geist Mono` via `--font-geist-mono`.
- Background base: `#f7f2ea`.
- Surface base: `#fffdfa`.
- Surface raised: `rgba(255,255,255,0.82)`.
- Surface muted: `#f1e8dc`.
- Text primary: `#201510`.
- Text editorial: `#59592a`.
- Text secondary: `#737373`.
- Accent orange: `#e67d2b`.
- Accent orange strong: `#c9671d`.
- Border default: `#e5d8c9`.
- Border strong: `#b8ab9b`.
- Radius panel: `32px`.
- Radius card: `24px`.
- Radius pill: `9999px`.
- Shadow card: `rgba(64,43,24,0.08) 0 18px 42px -18px`.
- Motion fast: `150ms`.
- Motion normal: `300ms`.

## Component-Level Rules
- Header must use a centered max-width shell, rounded pill shape, warm border, translucent white background, and compact navigation.
- Hero must use the orange dotted canvas, large halftone sun, oversized display headline, two rounded CTAs, and a terminal preview pushed into the lower-right/bottom area.
- Hero must not show a video play button unless there is a real recorded walkthrough.
- Featured logos must be monochrome gray and low-contrast, centered under the hero.
- Quote sections should use display typography, center alignment, and one orange-highlighted word.
- Bento/Magic UI cards must keep their animation/component behavior, but the visual skin must use ivory surfaces, warm borders, orange indicators, and dotted fields.
- Developer/map sections must use orange markers and muted paper cards, not blue SaaS gradients.
- Pricing cards must use warm white surfaces; the featured plan may use pale orange, not blue.
- FAQ must use quiet bordered cards, visible summary text, and comfortable line-height.
- CTA must use a dark warm card with orange stipple or halftone ornamentation.
- Footer must use the same warm border and muted text color as the rest of the page.

## Accessibility Requirements
- All interactive elements must have visible focus-visible states.
- Body text must meet WCAG 2.2 AA contrast on ivory surfaces.
- Orange text must not be used for small text unless contrast is verified.
- Buttons must preserve keyboard activation with Enter and Space where applicable.
- Details/FAQ summaries must remain keyboard reachable and screen-reader understandable.
- Motion components should remain decorative and must not block reading, clicking, or focus.

## Content And Tone Standards
- Tone should be concise, practical, and developer-friendly.
- Prefer concrete product wording: "Upload PDFs", "Run retrieval", "Saved memory", "Open workspace".
- Avoid generic AI claims such as "revolutionary", "next-gen", or "10x everything".
- Good: "Runs in your CLI. Your data, your machine."
- Good: "The app shows what the agent is doing."
- Avoid: "Unlock limitless AI potential."

## Anti-Patterns
- Do not reintroduce blue gradients as the primary visual language.
- Do not use purple AI SaaS styling.
- Do not place floating video play overlays in the hero without an actual product video.
- Do not mix unrelated font systems section-by-section.
- Do not use raw one-off colors when a semantic career token exists.
- Do not make Magic UI effects visually louder than the content.

## QA Checklist
- Hero matches the reference rhythm: dotted canvas, orange sun, terminal-only preview, and large display headline.
- Below-hero sections use warm paper backgrounds and orange accents.
- Header, cards, FAQ, pricing, CTA, and footer share the same border/radius/shadow language.
- `DM Sans`, `Space Grotesk`, and `Geist Mono` are loaded at the root layout.
- Production build passes.
- Lint configuration is reviewed separately so generated/backend virtualenv files are not scanned.
