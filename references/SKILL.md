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
- Product surface: marketing site for an AI chat, PDF, RAG, memory, and workflow agent lab

## Style Foundations
- Visual style: editorial terminal canvas, warm paper surfaces, orange halftone ornamentation, precise accessible implementation
- Main font style: `font.family.primary=DM Sans`, `font.family.stack=DM Sans, Arial, Helvetica, sans-serif`, `font.size.base=16px`, `font.weight.base=400`, `font.lineHeight.base=24px`
- Display font style: `font.family.display=Space Grotesk`, `font.family.stack=Space Grotesk, DM Sans, Arial, Helvetica, sans-serif`
- Mono font style: `font.family.mono=Geist Mono`
- Typography scale: `font.size.xs=12px`, `font.size.sm=14px`, `font.size.md=16px`, `font.size.lg=18px`, `font.size.xl=30px`, `font.size.2xl=36px`, `font.size.3xl=48px`, `font.size.4xl=72px`
- Color palette: `color.text.primary=#201510`, `color.text.editorial=#59592a`, `color.text.secondary=#737373`, `color.accent.orange=#e67d2b`, `color.accent.orangeStrong=#c9671d`, `color.surface.base=#f7f2ea`, `color.surface.canvas=#fffdfa`, `color.surface.muted=#f1e8dc`, `color.border.default=#e5d8c9`, `color.border.strong=#b8ab9b`
- Spacing scale: `space.1=4px`, `space.2=6px`, `space.3=8px`, `space.4=10px`, `space.5=12px`, `space.6=16px`, `space.7=20px`, `space.8=24px`, `space.9=32px`, `space.10=48px`
- Radius/shadow/motion tokens: `radius.sm=8px`, `radius.md=16px`, `radius.lg=24px`, `radius.panel=32px`, `radius.pill=9999px` | `shadow.card=rgba(64,43,24,0.08) 0 18px 42px -18px`, `shadow.panel=rgba(0,0,0,0.08) 0 10px 15px -3px` | `motion.duration.fast=150ms`, `motion.duration.normal=300ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.
- Decorative Magic UI effects must not trap focus or reduce readability.

## Writing Tone
concise, confident, developer-friendly, grounded, implementation-focused

## Rules: Do
- Use semantic warm tokens instead of raw blue SaaS styling.
- Preserve Magic UI component behavior while restyling surfaces to ivory, orange, and muted brown.
- Every component must define required states: default, hover, focus-visible, active, disabled, loading, error.
- Responsive behavior and edge-case handling should be specified for every component family.
- Accessibility acceptance criteria must be testable in implementation.
- Hero must remain terminal-only unless a real product walkthrough video exists.
- Dotted, halftone, and flickering textures should be decorative and subtle.
- Important context changes should be written into repository `.md` files instead of living only in chat.

## Rules: Don't
- Do not reintroduce purple or blue as the dominant AI brand language.
- Do not show a hero play button for placeholder content.
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.
- Do not let animation overpower content hierarchy.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and tokens.
3. Define component anatomy, variants, and interactions.
4. Add accessibility acceptance criteria.
5. Add anti-patterns and migration notes.
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
- When the design direction changes materially, update the related Markdown context files alongside the implementation.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Prefer system consistency over local visual exceptions.
- Production builds must pass before handoff.

<!-- TYPEUI_SH_MANAGED_END -->
