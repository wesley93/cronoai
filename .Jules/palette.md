## 2026-11-10 - SupplyModule Form Labels
**Learning:** The form in `SupplyModule.vue` lacked explicit `for` and `id` attributes to link labels to their corresponding inputs, which is a common accessibility anti-pattern.
**Action:** Always ensure that when creating or refactoring forms, every `<label>` element is explicitly linked to its corresponding input field using matching `for` and `id` attributes to improve screen reader accessibility.
