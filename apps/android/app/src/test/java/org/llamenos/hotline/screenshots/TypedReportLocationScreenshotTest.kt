package org.llamenos.hotline.screenshots

import com.github.takahirom.roborazzi.captureRoboImage
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Test
import org.junit.runner.RunWith
import org.llamenos.hotline.ui.reports.ReportsUiState
import org.llamenos.hotline.ui.reports.ReportsViewModel
import org.llamenos.hotline.ui.reports.TypedReportCreateScreen
import org.llamenos.hotline.ui.theme.LlamenosTheme
import org.llamenos.protocol.Category
import org.llamenos.protocol.ReportTypeDefinition
import org.llamenos.protocol.SharedAccessLevel
import org.llamenos.protocol.SharedField
import org.llamenos.protocol.SharedFieldLocationOptions
import org.llamenos.protocol.SharedIndexType
import org.llamenos.protocol.SharedLocationPrecision
import org.llamenos.protocol.SharedStatus
import org.llamenos.protocol.SharedType
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// Unlike ScreenshotTests.kt (which writes gallery images to the public
// marketing site at site/public/screenshots/android/ — outside this worker's
// apps/android/ ownership, and not obviously appropriate for a public gallery
// screenshot anyway, since this form shows law-enforcement-arrest-specific
// field labels), this evidence screenshot is written under the module's own
// (gitignored) build/ directory — see apps/android/app/build/, which
// .gitignore already excludes from version control.
private const val OUT = "build/roborazzi-evidence"

/**
 * Screenshot evidence for issue #768: the typed-report `location` field now
 * renders an address-search picker instead of a free-text box, and the
 * `file` field renders a genuinely disabled "Coming soon" placeholder instead
 * of an editable field that silently discarded its input.
 *
 * Run with: cd apps/android && ./gradlew testDebugUnitTest --tests
 * "org.llamenos.hotline.screenshots.TypedReportLocationScreenshotTest"
 *
 * Output: apps/android/app/build/roborazzi-evidence/typed-report-location-android.png
 * (a build artifact, not committed — see [ScreenshotTests] for the marketing
 * gallery's own OUT convention and shared Roborazzi setup, which this
 * deliberately does not write into).
 */
@RunWith(org.robolectric.RobolectricTestRunner::class)
@Config(sdk = [34], application = ScreenshotTestApp::class, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class TypedReportLocationScreenshotTest {

    private val locationField = SharedField(
        id = "field-location",
        label = "Incident Location",
        name = "incident_location",
        type = SharedType.Location,
        required = true,
        accessLevel = SharedAccessLevel.All,
        indexType = SharedIndexType.Location,
        indexable = true,
        locationOptions = SharedFieldLocationOptions(
            allowAutocomplete = true,
            allowGps = true,
            maxPrecision = SharedLocationPrecision.Exact,
        ),
        order = 0,
    )

    private val fileField = SharedField(
        id = "field-evidence-photo",
        label = "Evidence Photo",
        name = "evidence_photo",
        type = SharedType.File,
        required = false,
        accessLevel = SharedAccessLevel.All,
        order = 1,
    )

    private val sampleReportType = ReportTypeDefinition(
        id = "rt-lo-arrest",
        hubID = "hub-001",
        name = "lo_arrest_report",
        label = "LO Arrest",
        labelPlural = "LO Arrests",
        description = "Report a law enforcement arrest for jail support follow-up.",
        category = Category.Report,
        fields = listOf(locationField, fileField),
        statuses = listOf(
            SharedStatus(label = "Waiting", value = "waiting", isDefault = true),
            SharedStatus(label = "Active", value = "active"),
            SharedStatus(label = "Closed", value = "closed", isClosed = true),
        ),
        defaultStatus = "waiting",
        mobileOptimized = true,
        createdAt = "2026-04-01T00:00:00Z",
        updatedAt = "2026-04-01T00:00:00Z",
    )

    @Test
    fun typedReportCreateScreen_locationAndFileFields() {
        val vm = mockk<ReportsViewModel>(relaxed = true)
        every { vm.uiState } returns MutableStateFlow(
            ReportsUiState(reportTypes = listOf(sampleReportType)),
        )

        captureRoboImage("$OUT/typed-report-location-android.png") {
            LlamenosTheme(darkTheme = true) {
                TypedReportCreateScreen(
                    viewModel = vm,
                    reportTypeId = sampleReportType.id,
                    onNavigateBack = {},
                )
            }
        }
    }
}
