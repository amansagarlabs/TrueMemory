---
name: design-system-firecrawl
description: Creates implementation-ready design-system guidance with tokens, component behavior, and accessibility standards. Use when creating or updating UI rules, component specifications, or design-system documentation for Firecrawl.
---

<!-- TYPEUI_SH_MANAGED_START -->

# Firecrawl

## Context and goals
Firecrawl marketing UI must feel structured, technical, and efficient to ship, with a light default theme and orange used only as the primary accent for emphasis, status, and calls to action.

## Brand
- Product/brand: Firecrawl
- URL: https://www.firecrawl.dev/
- Audience: developers and technical teams
- Product surface: marketing site

## Design tokens and foundations
- Visual style must be structured, tokenized, content-first, accessible, and implementation-first.
- Default theme must be light.
- Dark theme should be supported, but it must remain secondary to the default light experience.
- Main font must be `suisse` with the stack `suisse, suisse Fallback, ui-sans-serif, system-ui, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji`.
- Base type must be `16px` with `400` weight and `24px` line height.
- Typography scale must stay fixed to `12px`, `13px`, `14px`, `15px`, `16px`, `40px`, `52px`, and `60px`.
- Orange must be the primary accent and should be reserved for emphasis, active states, status cues, and important CTAs.
- Light surfaces should stay warm, quiet, and content-first.
- Dark surfaces should preserve the same token structure and accent system, not introduce a separate visual language.
- High-contrast text must remain readable on both light and dark surfaces.

### Color palette
| Token | Value |
|---|---|
| `color.text.primary` | `color(display-p3 0.14902 0.14902 0.14902)` |
| `color.text.secondary` | `color(display-p3 0.14902 0.14902 0.14902 / 0.721569)` |
| `color.text.tertiary` | `color(display-p3 0.980392 0.364706 0.098039)` |
| `color.text.inverse` | `color(display-p3 1 1 1)` |
| `color.surface.base` | `color(display-p3 1 1 1)` |
| `color.surface.muted` | `color(display-p3 0 0 0 / 0.039216)` |
| `color.surface.raised` | `color(display-p3 0.976471 0.976471 0.976471)` |
| `color.surface.strong` | `color(display-p3 0.14902 0.14902 0.14902)` |
| `color.border.default` | `#e5e7eb` |
| `color.border.muted` | `color(display-p3 0.929412 0.929412 0.929412)` |

### Spacing scale
| Token | Value |
|---|---|
| `space.1` | `1px` |
| `space.2` | `4px` |
| `space.3` | `6px` |
| `space.4` | `8px` |
| `space.5` | `10px` |
| `space.6` | `12px` |
| `space.7` | `16px` |
| `space.8` | `20px` |

### Radius / shadow / motion
| Category | Token | Value |
|---|---|---|
| Radius | `radius.xs` | `6px` |
| Radius | `radius.sm` | `8px` |
| Radius | `radius.md` | `10px` |
| Radius | `radius.lg` | `20px` |
| Radius | `radius.xl` | `999px` |
| Shadow | `shadow.1` | `color(display-p3 0.9804 0.1127 0.098 / 0.2) 0px -6px 12px 0px inset, color(display-p3 0.9804 0.3647 0.098 / 0.12) 0px 2px 4px 0px, color(display-p3 0.9804 0.3647 0.098 / 0.12) 0px 1px 1px 0px, color(display-p3 0.9804 0.3647 0.098 / 0.16) 0px 0.5px 0.5px 0px, color(display-p3 0.9804 0.3647 0.098 / 0.2) 0px 0.25px 0.25px 0px` |
| Motion | `motion.duration.instant` | `50ms` |
| Motion | `motion.duration.fast` | `150ms` |
| Motion | `motion.duration.normal` | `200ms` |

## Component-level rules

### General component requirements
- Every component must define states for default, hover, focus-visible, active, disabled, loading, and error.
- Every interactive component must document keyboard, pointer, and touch behavior.
- Every component should use the token scale for spacing and typography.
- Every component should include long-content, overflow, and empty-state handling when relevant.
- Implementation should prefer system consistency over local visual exceptions.

### Page density guidance
- Links density: 104
- Buttons density: 83
- Navigation density: 3
- Inputs density: 1
- Marketing pages should not feel crowded at desktop widths, but they should still read as dense, technical, and credible.

### Navigation
- Navigation must stay compact and tokenized.
- Primary nav items should use icon plus label on light surfaces with the icon carrying the orange accent only where active.
- Hover should use a subtle surface shift, not a heavy fill.
- Focus-visible should use a clearly visible 2px ring using `color.text.tertiary` or an approved semantic focus token.
- Disabled nav items must remain readable but non-interactive.
- Collapsed navigation should keep icon alignment centered and maintain tooltips or accessible labels.
- Long labels must truncate cleanly without wrapping the entire rail.

### Buttons
- Buttons should use `radius.xl` for pill CTAs and `radius.sm` or `radius.md` for secondary actions.
- Primary CTA buttons should use orange as the fill or border accent depending on contrast.
- Secondary buttons should use muted surfaces with a low-contrast border.
- Hover state should increase contrast slightly and should not introduce a new color family.
- Active state should compress subtly, not jump or shift layout.
- Loading state should replace labels with a spinner or inline progress cue while preserving width.
- Error state should be reserved for destructive or failed actions and should use semantic error styling, not orange.
- Touch targets should be at least `44x44px`.

### Inputs
- Inputs should stay full-width within their container and should not exceed the design token system.
- Default state should use a light surface with a muted border.
- Hover should slightly increase border contrast.
- Focus-visible should use a visible ring and should never rely on border color alone.
- Disabled inputs should remain legible and should not appear hidden.
- Loading inputs should show a skeleton or progress indicator if the field depends on async state.
- Error inputs should show clear error text and border treatment.
- Empty-state helper text should be short and direct.
- Long input values should not break layout; they should scroll, clip, or wrap according to component intent.

### Content sections
- Section headers should be short and descriptive.
- Body copy should stay direct, technical, and utility-first.
- Cards should use light surface elevation and a restrained border.
- Orange should be used sparingly as a signal, not as background noise.
- Dense data sections should rely on spacing, dividers, and type hierarchy rather than saturated fills.

## Accessibility requirements and testable acceptance criteria
- WCAG 2.2 AA must be the target.
- Keyboard-first interactions must be supported.
- Focus-visible rules must be visible and testable.
- Contrast constraints must be satisfied for both themes.
- Every accessibility rule must be testable in implementation.

### Testable criteria
| Criteria | Pass | Fail |
|---|---|---|
| Focus-visible ring visible on all interactive elements | All keyboard-focusable elements show a 2px or stronger ring | Ring is missing or clipped |
| Color contrast meets AA | Primary text on default surfaces passes contrast checks | Contrast ratio falls below AA |
| Touch targets meet minimum size | All tappable controls are at least `44x44px` | Any tappable control is smaller |
| Icon-only buttons have labels | Every icon-only button has `aria-label` or equivalent accessible name | Any icon-only button lacks a label |
| Loading state is exposed | Async controls expose visible loading feedback | Loading state is silent or ambiguous |
| Error state is identifiable | Failed interactions show visible error text or styling | Error state is hidden or only color-coded |

## Content and tone standards with examples
- Copy should be concrete, action-oriented, and developer-friendly.
- Labels should be short and specific.
- Marketing claims should be precise, not exaggerated.
- Use nouns and verbs that map to product behavior.

### Examples
- Good: "Firecrawl turns websites into AI-ready data in one API call."
- Good: "Supports crawling, scraping, and extraction with a single endpoint."
- Good: "Start scraping in minutes."
- Avoid: "Revolutionary data extraction"
- Avoid: "Next-gen crawling"
- Avoid: "Unlock limitless web data"

## Anti-patterns and prohibited implementations
- Do not use raw hex values when a semantic Firecrawl token exists.
- Do not ship interactive components without all required states.
- Do not use one-off border-radius or spacing values outside the token scale.
- Do not hide focus indicators.
- Do not mix font families across sections.
- Do not ship ambiguous icon-only buttons without accessible labels.
- Do not make dark mode the default visual identity.
- Do not use orange as a broad surface fill when a light neutral surface and orange accent will do.
- Do not make copy vague, promotional, or hyperbolic.

## QA checklist
- Default theme is light in implementation and documentation.
- All surfaces use `color.surface.*` tokens.
- All text colors use `color.text.*` tokens.
- All spacing uses the defined `space.*` scale.
- Every component documents all 7 required states.
- All icon-only buttons have accessible names.
- Touch targets are at least `44x44px` on mobile.
- Focus-visible rings are visible and at least 2px wide.
- Motion durations use `motion.duration.*` tokens.
- Orange appears only as an accent or deliberate emphasis.
- Dark theme mirrors the same token system rather than introducing a separate visual language.

<!-- TYPEUI_SH_MANAGED_END -->
