```markdown
# Design System Specification: Editorial Authority

## 1. Overview & Creative North Star: "The Digital Jurist"
This design system is not a mere utility; it is a digital manifestation of legal prestige. The Creative North Star is **"The Digital Jurist"**—an aesthetic that balances the gravity of a centuries-old law library with the frictionless efficiency of modern SaaS.

To move beyond the "generic template" look, we employ **Editorial Layout Logic**. We reject the rigid, boxy constraints of standard dashboards in favor of high-contrast typography, intentional white space, and a layered surface architecture. We favor "The power of the void"—using empty space to command focus and convey a sense of calm, high-stakes precision.

## 2. Colors & Surface Philosophy
The palette is rooted in a deep, authoritative navy, punctuated by a prestigious gold. However, the sophistication lies in how these colors are layered, not just applied.

### The "No-Line" Rule
**Prohibit 1px solid borders for sectioning.** Traditional lines clutter the mind. Instead, define boundaries through:
- **Tonal Shifts:** Place a `surface-container-low` component against a `surface` background.
- **Negative Space:** Use the spacing scale to create "invisible walls."
- **Optical Weight:** Use typography to anchor a section rather than a box.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of fine parchment and glass.
- **Base Layer:** `surface` (#f8f9fa) – The foundation.
- **Content Blocks:** `surface-container-low` (#f3f4f5) – Use this for secondary sidebars or non-critical groupings.
- **Primary Focus:** `surface-container-lowest` (#ffffff) – Reserved for the "active document" or main workspace. This creates a natural "lift" that draws the eye.

### Signature Textures & Glassmorphism
- **CTAs & Heroes:** Do not use flat navy. Use a subtle linear gradient from `primary` (#022448) to `primary-container` (#1E3A5F) at a 135-degree angle. This adds "soul" and depth.
- **Overlays:** For modals or floating menus, use `surface-container-lowest` with an 80% opacity and a `24px` backdrop-blur. This "frosted glass" effect ensures the user never loses context of the legal data beneath.

## 3. Typography: The Voice of Authority
We utilize **Inter** for its neutral, highly legible characteristics, but we style it with editorial intent.

- **Display (Large/Medium/Small):** Used for high-level dashboard summaries or landing headers. Tighten letter-spacing (-0.02em) to create a "dense" professional feel.
- **Headlines:** Use `headline-lg` for case titles. This is the "Anchor" of the page.
- **Body:** `body-lg` is the workhorse. Ensure a line-height of 1.6 to maintain readability during long-form legal review.
- **Labels:** `label-md` and `label-sm` must always be in `on-surface-variant` (#43474e) to distinguish metadata from content.

## 4. Elevation & Depth: Tonal Layering
We move away from the "drop shadow" era. Depth is a result of light and material, not artificial outlines.

- **The Layering Principle:** To highlight a specific case file, place a `surface-container-lowest` card on a `surface-container` background. The slight shift from #ffffff to #edeeef provides all the separation necessary.
- **Ambient Shadows:** When a physical lift is required (e.g., a floating action button), use a shadow tinted with `primary` (#022448) at 6% opacity with a 32px blur. It should feel like a soft glow, not a dark smudge.
- **The "Ghost Border" Fallback:** If accessibility requires a stroke, use `outline-variant` (#c4c6cf) at **15% opacity**. It should be felt, not seen.

## 5. Components: Precision Primitives

### Buttons: The "Seal of Approval"
- **Primary:** Gradient fill (`primary` to `primary-container`), `roundness-md` (0.375rem). No border. White text.
- **Secondary:** Transparent background with a `Ghost Border`. Text color: `primary`.
- **Tertiary (Editorial):** No background, no border. Underline on hover only. Used for "Cancel" or "Go Back."

### Input Fields: The "Lined Paper"
- Abandon the four-sided box. Use a `surface-container-low` background with a 2px bottom-border in `primary`. This mimics the feel of a legal pad and reduces visual noise.
- **Error State:** Use `error` (#ba1a1a) for the bottom border and helper text only.

### Cards & Lists: The "No-Divider" Protocol
- **Forbidden:** Horizontal `<hr>` tags or list dividers.
- **Required:** Use `24px` of vertical white space to separate list items. For complex data grids, use alternating row fills of `surface` and `surface-container-low` (zebra striping) at a very subtle 2% contrast difference.

### Signature Component: The "Legal Status Chip"
- Uses `tertiary-fixed-dim` (#f6be39) for background and `on-tertiary-fixed` (#261a00) for text. These gold accents must be used sparingly to indicate high-priority "Alerts" or "Urgent Filings."

## 6. Do’s and Don’ts

### Do:
- **Do** embrace asymmetry. A sidebar that doesn't reach the bottom of the screen creates a sophisticated, "open" feel.
- **Do** use `display-lg` typography for single, impactful data points (e.g., "98% Compliance").
- **Do** use `surface-bright` for the most critical action areas to create a "lighthouse" effect.

### Don't:
- **Don't** use 100% black. Use `on-surface` (#191c1d) for text to maintain a premium, softened contrast.
- **Don't** use standard "Success Green." In a legal context, green can feel "cheap." Use the Navy/Gold palette and rely on iconography for status.
- **Don't** use `roundness-full` (pills) for anything other than status chips. Buttons and containers should stay at `md` or `lg` to maintain an architectural, authoritative structure.

---
*Director's Final Note: Remember, a lawyer’s focus is their most valuable asset. Every pixel that doesn't serve a purpose is a distraction. Build with intent.*```