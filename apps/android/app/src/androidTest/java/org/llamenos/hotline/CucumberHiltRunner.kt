package org.llamenos.hotline

import io.cucumber.android.runner.CucumberAndroidJUnitRunner
import io.cucumber.junit.CucumberOptions

/**
 * Cucumber test runner for BDD E2E tests.
 *
 * Reads .feature files from androidTest/assets/features/ and matches them
 * with step definitions in the [org.llamenos.hotline.steps] package.
 *
 * Feature files are copied from packages/test-specs/features/ by the Gradle
 * copyFeatureFiles task at preBuild time.
 *
 * Uses the production [LlamenosApp] (via manifest) so the real Hilt component
 * is available for @AndroidEntryPoint activities. No HiltTestApplication needed
 * since we don't replace any bindings in E2E tests.
 */
@CucumberOptions(
    features = ["features"],
    glue = ["org.llamenos.hotline.steps"],
    tags = "@android and not @wip",
)
class CucumberHiltRunner : CucumberAndroidJUnitRunner()
