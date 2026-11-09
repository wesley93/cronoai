## 2026-11-09 - Accessibility: Form Labels
**Learning:** In Vue templates containing forms, relying simply on wrapping input elements with <label> tags or adjacent labels is less accessible. Ensure robust accessibility by explicitly linking <label> and <input>/<select> elements using matching `for` and `id` attributes, ensuring proper screen reader association.
**Action:** When adding or updating forms in the application, specifically search for and verify that all inputs have explicit `id` attributes linked by `for` on the corresponding labels.
