## 2026-11-02 - Title attributes are not enough for screen readers
**Learning:** While the app used `title` attributes heavily for icon-only buttons (like attach photo, send, resolve restriction), these are often insufficient for screen reader accessibility compared to a dedicated `aria-label`.
**Action:** Always add an explicit `aria-label` to any button that doesn't have visible text, even if it has a `title` attribute.
