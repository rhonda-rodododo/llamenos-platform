# Epic 347: Android CMS BDD Tests (Cucumber)

## Overview
Cucumber step definitions for all CMS features on Android, matching shared BDD scenarios.

## Step Definition Files
- `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/cases/CaseListSteps.kt`
- `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/cases/CaseDetailSteps.kt`
- `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/cases/CaseContactSteps.kt`
- `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/cases/CaseAssignmentSteps.kt`

## Feature Files
Shared feature files from `packages/test-specs/features/core/` copied to `apps/android/app/src/androidTest/assets/features/core/` by the `copyFeatureFiles` Gradle task.

## Pattern
Cucumber-android + Hilt, `onNodeWithTag()` + `testTag` selectors:
```kotlin
@When("I navigate to the Cases tab")
fun iNavigateToTheCasesTab() {
    navigateViaDashboardCard("cases-card")
    waitForNode("case-list")
}

@Then("entity type tabs should be visible")
fun entityTypeTabsShouldBeVisible() {
    onNodeWithTag("case-type-tabs").assertIsDisplayed()
}
```

## Gate
`bun run test:android` — CMS Cucumber tests compile and pass
