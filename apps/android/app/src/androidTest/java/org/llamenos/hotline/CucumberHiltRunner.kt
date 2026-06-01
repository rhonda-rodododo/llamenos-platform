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
class CucumberHiltRunner : CucumberAndroidJUnitRunner() {

    override fun onCreate(arguments: android.os.Bundle) {
        // Override compile-time @CucumberOptions features with runtime instrumentation arg.
        //
        // Two paths set the shard feature list:
        // 1. CI (Gradle -P): uses "cucumberFeatures" (no dot) because Gradle's
        //    -Pandroid.testInstrumentationRunnerArguments.cucumber.features silently
        //    drops the value — dots in the key get misinterpreted as nested property access.
        // 2. Local (am instrument -e): uses "cucumber.features" directly — dots are
        //    fine in bundle keys set via `am instrument`.
        //
        // We check both keys and write to "cucumber.features" which is what
        // cucumber-android's CucumberAndroidJUnitRunner reads from the bundle.
        val shardFeatures = arguments.getString("cucumberFeatures")
            ?: arguments.getString("cucumber.features")
        if (!shardFeatures.isNullOrBlank()) {
            arguments.putString("cucumber.features", shardFeatures)
        }
        super.onCreate(arguments)
    }
}
