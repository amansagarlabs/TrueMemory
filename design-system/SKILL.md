---
name: design-system-career
description: Creates implementation-ready design-system guidance using the career-ops visual system for Aman Agent Lab marketing surfaces.
---

<!-- TYPEUI_SH_MANAGED_START -->

# career

## Mission
Deliver implementation-ready design-system guidance that applies the career-ops visual language consistently across Aman Agent Lab marketing interfaces.

## Brand
- Product/brand: Aman Agent Lab
- Reference style: https://career-ops.org/
- Audience: developers, AI builders, technical teams, and product-minded founders
- Product surface: marketing site

## Style Foundations
- Visual style: printed halftone wash, editorial terminal canvas, warm paper surfaces, quiet cards, restrained motion
- Main font style: `font.family.primary=DM Sans`, `font.family.stack=DM Sans, Arial, Helvetica, sans-serif`, `font.size.base=16px`, `font.weight.base=400`, `font.lineHeight.base=24px`
- Display font style: `font.family.display=Space Grotesk`, `font.family.stack=Space Grotesk, DM Sans, Arial, Helvetica, sans-serif`
- Mono font style: `font.family.mono=Geist Mono`
- Typography scale: `font.size.xs=12px`, `font.size.sm=14px`, `font.size.md=16px`, `font.size.lg=18px`, `font.size.xl=30px`, `font.size.2xl=36px`, `font.size.3xl=48px`, `font.size.4xl=72px`
- Color palette: `color.text.primary=#201510`, `color.text.editorial=#59592a`, `color.text.secondary=#737373`, `color.text.inverse=#fffdfa`, `color.accent.orange=#e67d2b`, `color.accent.orangeStrong=#c9671d`, `color.surface.base=#f7f2ea`, `color.surface.canvas=#fffdfa`, `color.surface.muted=#f1e8dc`, `color.surface.raised=rgba(255,255,255,0.82)`, `color.border.default=#e5d8c9`, `color.border.strong=#b8ab9b`
- Spacing scale: `space.1=4px`, `space.2=6px`, `space.3=8px`, `space.4=10px`, `space.5=12px`, `space.6=16px`, `space.7=20px`, `space.8=24px`, `space.9=32px`, `space.10=48px`
- Radius/shadow/motion tokens: `radius.sm=8px`, `radius.md=16px`, `radius.lg=24px`, `radius.panel=32px`, `radius.pill=9999px` | `shadow.card=rgba(64,43,24,0.08) 0 18px 42px -18px`, `shadow.panel=rgba(0,0,0,0.08) 0 10px 15px -3px` | `motion.duration.instant=100ms`, `motion.duration.fast=150ms`, `motion.duration.normal=300ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
concise, confident, developer-friendly, grounded, implementation-focused

## Rules: Do
- Use semantic warm tokens, not raw hex values, in component guidance.
- Preserve Magic UI component behavior while restyling surfaces to ivory, orange, and muted brown.
- Every component must define required states: default, hover, focus-visible, active, disabled, loading, error.
- Responsive behavior and edge-case handling should be specified for every component family.
- Accessibility acceptance criteria must be testable in implementation.
- Hero must use a terminal-first composition unless a real recorded walkthrough exists.
- Halftone, dotted, and flickering effects should support hierarchy rather than dominate it.
- Important context changes should be captured in repository `.md` files so future agents and contributors inherit the reasoning.

## Rules: Don't
- Do not reintroduce blue or purple as the dominant brand language.
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.
- Do not show a floating play button for placeholder hero content.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and semantic tokens.
3. Define component anatomy, variants, interactions, and state behavior.
4. Add accessibility acceptance criteria.
5. Add anti-patterns, migration notes, and edge-case handling.
6. End with QA checklist.

## Required Output Structure
- Context and goals
- Design tokens and foundations
- Component-level rules (anatomy, variants, states, responsive behavior)
- Accessibility requirements and testable acceptance criteria
- Content and tone standards with examples
- Anti-patterns and prohibited implementations
- QA checklist

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.
- Include section rhythm for hero, logos, quote, feature grid, workflow, developer proof, pricing, FAQ, CTA, and footer.
- When design or product direction changes materially, update the related Markdown context files alongside the implementation.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Prefer system consistency over local visual exceptions.
- Production builds must pass before handoff.

<!-- TYPEUI_SH_MANAGED_END -->
