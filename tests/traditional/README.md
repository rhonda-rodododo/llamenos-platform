# Traditional Playwright Tests

This directory contains traditional-style Playwright tests (using `test` and `expect` directly) as part of the hybrid BDD-to-traditional migration.

## Rationale

UI-focused tests that assert element visibility and text content are better expressed as traditional Playwright tests. They are more concise and don't need the Gherkin abstraction layer. Backend API contract tests continue to use BDD.

## Running

```bash
# Run only traditional tests
bunx playwright test --project=traditional

# Run all desktop tests including traditional
bunx playwright test --project=bootstrap --project=chromium --project=bdd --project=traditional
```

## Patterns

- Import `test` and `expect` from `../traditional-fixtures` to get the `workerHub` fixture
- Use Page Object methods from `tests/pages/index.ts` for common interactions
- Always use `data-testid` selectors — never fragile XPath or CSS selectors
- No `waitForTimeout` calls — use deterministic assertions (`.toBeVisible()`, `.toHaveText()`)

## Files

- `auth.spec.ts` — Admin PIN login, volunteer login, invalid PIN scenarios
- `call-lifecycle.spec.ts` — Call history page, dashboard cards
