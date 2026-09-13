/**
 * Deterministic UI helpers shared by step definitions.
 *
 * These exist to replace "probe" control flow — `if (await loc.isVisible())` — which
 * races the page load: Playwright's `isVisible()` never waits (its `timeout` option is
 * ignored), so the branch taken depends on how far rendering had got. Every helper here
 * waits for a settled condition first and fails loudly instead of silently choosing a
 * different code path.
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { Timeouts } from '../../helpers'

/**
 * Expand a `SettingsSection` collapsible and return the section locator.
 *
 * The section's `{id}-trigger` header is the Radix CollapsibleTrigger, which carries
 * `aria-expanded`. Expansion state is initialised synchronously on first render
 * (usePersistedExpanded: sessionStorage + deep link), so once the trigger is visible the
 * attribute is settled and reading it is not a race. The final assertion guarantees the
 * end state regardless.
 */
export async function expandSettingsSection(page: Page, sectionTestId: string): Promise<Locator> {
  const section = page.getByTestId(sectionTestId)
  const trigger = section.getByTestId(`${sectionTestId}-trigger`)
  await expect(trigger).toBeVisible({ timeout: Timeouts.ELEMENT })
  await trigger.scrollIntoViewIfNeeded()
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click()
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: Timeouts.ELEMENT })
  await expect(section.locator('[data-slot="collapsible-content"]')).toHaveAttribute('data-state', 'open')
  return section
}

/**
 * Collapse a `SettingsSection` collapsible (the mirror of expandSettingsSection).
 *
 * Used by steps that assert collapsed-only rendering, e.g. a section's statusSummary
 * which only renders while `!expanded`. Same settled-attribute reasoning as expand.
 */
export async function collapseSettingsSection(page: Page, sectionTestId: string): Promise<Locator> {
  const section = page.getByTestId(sectionTestId)
  const trigger = section.getByTestId(`${sectionTestId}-trigger`)
  await expect(trigger).toBeVisible({ timeout: Timeouts.ELEMENT })
  await trigger.scrollIntoViewIfNeeded()
  if ((await trigger.getAttribute('aria-expanded')) !== 'false') {
    await trigger.click()
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'false', { timeout: Timeouts.ELEMENT })
  await expect(section.locator('[data-slot="collapsible-content"]')).toHaveAttribute('data-state', 'closed')
  return section
}

/**
 * Resolve a user-facing control from Gherkin text and click it.
 *
 * Candidates are ordered by specificity. The helper first WAITS until at least one
 * candidate is visible, then picks the most specific tier that has exactly one visible
 * match. A tier with several visible matches is an ambiguity error — it never falls
 * through to "whatever `.first()` returns".
 */
export async function clickResolvedControl(
  page: Page,
  text: string,
  testIds: string[],
): Promise<void> {
  const openDialog = page.getByRole('dialog').filter({ visible: true })
  const named = (scope: Page | Locator, exact: boolean) =>
    scope.getByRole('button', { name: text, exact })
      .or(scope.getByRole('link', { name: text, exact }))
      .or(scope.getByRole('tab', { name: text, exact }))

  const tiers: { label: string; locator: Locator }[] = [
    // A modal makes everything behind it inert: a matching control inside it wins.
    ...testIds.map(id => ({ label: `testid ${id} in open dialog`, locator: openDialog.getByTestId(id) })),
    { label: 'control in open dialog', locator: named(openDialog, true) },
    ...testIds.map(id => ({ label: `testid ${id}`, locator: page.getByTestId(id) })),
    { label: 'exact accessible name', locator: named(page, true) },
    { label: 'accessible name substring', locator: named(page, false) },
    { label: 'exact text', locator: page.getByText(text, { exact: true }) },
  ]

  let any = tiers[0].locator
  for (const tier of tiers.slice(1)) any = any.or(tier.locator)
  await expect(any.filter({ visible: true }).first()).toBeVisible({ timeout: Timeouts.ELEMENT })

  for (const tier of tiers) {
    const visible = tier.locator.filter({ visible: true })
    const count = await visible.count()
    if (count === 0) continue
    if (count > 1) {
      throw new Error(`"${text}" is ambiguous: ${count} visible matches for ${tier.label}. Scope the step.`)
    }
    await expect(visible).toBeEnabled({ timeout: Timeouts.ELEMENT })
    await visible.click()
    return
  }
  throw new Error(`"${text}": a candidate was visible but disappeared before it could be clicked`)
}
