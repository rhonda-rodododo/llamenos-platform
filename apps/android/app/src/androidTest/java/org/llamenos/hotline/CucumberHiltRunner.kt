package org.llamenos.hotline

import android.app.Application
import android.content.Context
import dagger.hilt.android.testing.HiltTestApplication
import io.cucumber.android.runner.CucumberAndroidJUnitRunner
import io.cucumber.junit.CucumberOptions

/**
 * Cucumber test runner with Hilt integration.
 *
 * Replaces [HiltTestRunner] — reads .feature files from androidTest/assets/features/
 * and matches them with step definitions in the [org.llamenos.hotline.steps] package.
 *
 * Feature files are copied from packages/test-specs/features/ by the Gradle
 * copyFeatureFiles task at preBuild time.
 */
@CucumberOptions(
    features = ["features"],
    glue = ["org.llamenos.hotline.steps"],
    tags = "@android",
)
class CucumberHiltRunner : CucumberAndroidJUnitRunner() {
    override fun newApplication(
        cl: ClassLoader,
        className: String,
        context: Context,
    ): Application {
        return super.newApplication(cl, HiltTestApplication::class.java.name, context)
    }
}
