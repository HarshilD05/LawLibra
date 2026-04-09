# Design System: The Sovereign Ledger

## 1. Overview & Creative North Star
**Creative North Star: The Sovereign Ledger**
In the legal world, authority is not shouted; it is felt through weight, precision, and clarity. This design system moves away from the "disposable" feel of generic SaaS templates and toward the aesthetic of a bespoke editorial publication. We are building a digital workspace that feels like a custom-bound legal brief—intentional, prestigious, and unerringly organized.

To achieve this, we reject the "boxed-in" layout. We utilize **intentional asymmetry**, where heavy-weight typography (Manrope) provides an anchor for dense data. By leveraging high-contrast scales and overlapping tonal layers, we create an environment that suggests both modern efficiency and traditional prestige.

## 2. Colors & Surface Philosophy
The palette is rooted in the depth of primary color (`#0A1628`) and the heritage of secondary color (`#C9A84C`).

### The "No-Line" Rule
Traditional UI relies on 1px borders to separate content. In this system, **1px solid borders are strictly prohibited for sectioning.** Boundaries must be defined through:
*   **Background Shifts:** Distinguish the sidebar from the workspace by placing a `surface_container_low` sidebar against a `surface` main background.
*   **Tonal Transitions:** Use `surface_container_lowest` for active content areas to make them "pop" against the `background` without a single stroke.

### Surface Hierarchy & Nesting
Think of the UI as a series of physical layers of fine paper.
1.  **Base Layer:** `background` (#f7f9fc) – The desk surface.
2.  **Section Layer:** `surface_container_low` (#f2f4f7) – The folder.
3.  **Action Layer:** `surface_container_lowest` (#ffffff) – The active document.

### The "Glass & Gradient" Rule
To elevate the experience, floating elements (Modals, Popovers, Dropdowns) should utilize **Glassmorphism**. Use `surface_container_lowest` at 85% opacity with a `20px` backdrop-blur.
For primary CTAs, apply a subtle linear gradient from `primary` to `on_primary_container` (top-to-bottom) to give buttons a "milled" metal appearance rather than a flat digital fill.

## 3. Typography
We use a dual-font strategy to balance editorial character with functional legibility.

*   **Display & Headlines (Manrope):** This is our "Brand Voice." The wide apertures and geometric forms of Manrope command attention. Use `display-lg` for dashboard summaries and `headline-sm` for case titles.
*   **Body & Labels (Inter):** This is our "Utility Voice." Inter is designed for high-legibility in dense environments. All case files, legal notes, and metadata use the Inter scale.

**Hierarchy Note:** Use `on_surface_variant` for labels to create a sophisticated "ink-on-paper" feel, keeping the highest contrast (`on_surface`) reserved for critical information only.

## 4. Elevation & Depth
We convey importance through **Tonal Layering** rather than structural scaffolding.

*   **The Layering Principle:** Instead of a shadow, place a `surface_container_highest` element inside a `surface_container_low` area to create an inset, tactile feel.
*   **Ambient Shadows:** If an element must float (e.g., a "New Case" FAB), use a shadow with a `24px` blur, `0px` spread, and `4%` opacity. The shadow color must be a tinted version of `on_surface` (a deep navy tint), never pure black.
*   **The Ghost Border:** If accessibility requires a container edge (e.g., in high-density data tables), use a "Ghost Border": the `outline_variant` token at **15% opacity**. It should be felt, not seen.

## 5. Components

### Buttons
*   **Primary:** Solid primary color (`#0A1628`). Use a roundedness of `1` (subtle roundedness) for a modern, approachable edge, consistent with the system's overall feel.
*   **Secondary:** Outlined with `outline_variant`. Ensure the label uses `label-md` in `primary` color.
*   **Tertiary:** No background, `primary` text. Use for low-priority actions like "Cancel" or "View Archive."

### Cards & Case Files
*   **Execution:** Forbid the use of divider lines. Separate "Case Header" from "Case Metadata" using a vertical spacing of `1.5rem`.
*   **Nesting:** Place `surface_container_lowest` cards on a `surface_container_low` background.

### Status Badges (The "Pill")
*   **Style:** Use `full` (9999px) roundedness.
*   **Coloring:** Use the "Container" tokens for the background and "On Container" for text.
    *   *Active:* `on_tertiary_container` background with `on_tertiary` text.
    *   *Overdue:* `error_container` background with `on_error_container` text.

### Inputs & Search
*   **Design:** Use `surface_container_lowest` with a `Ghost Border`. When focused, the border should transition to secondary color (`#C9A84C`) at 100% opacity to signal "The Golden Thread" of user focus.

### The Sidebar (Navigation)
*   **Layout:** A monolithic pillar of `primary_container`. Icons should be `outline_variant` when inactive and secondary color (`#C9A84C`) when active. This creates a high-contrast, premium "cockpit" for the lawyer.

## 6. Do’s and Don’ts

### Do:
*   **Use Whitespace as a Tool:** Allow `display-md` headlines to have at least `32px` of breathing room below them. The spacing in the system is `2` (normal).
*   **Layer Surfaces:** Always place lighter surfaces on top of darker ones to simulate natural light falling on a desk.
*   **Trust the Type:** Let the size difference between `title-lg` and `body-sm` do the work of a border.

### Don’t:
*   **No "Box-Shadow" Abuse:** Avoid stacking multiple shadows. Use tonal shifts first.
*   **No High-Contrast Grids:** Avoid dark grid lines in tables. Use alternating row colors (`surface` and `surface_container_low`) instead.
*   **No Default Corners:** Never use `none` or `sm` roundedness unless specifically for a technical utility. All premium elements should use `1` (subtle roundedness) for a curated feel.