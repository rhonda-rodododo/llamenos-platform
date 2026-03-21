plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

// ecryptfs (encrypted home dirs) has a 143-byte filename limit. D8 global synthetics
// for Compose lambdas generate filenames up to ~150 chars, causing build failures.
// Redirect build output to /tmp on Linux to avoid this. Set ANDROID_BUILD_DIR to override.
val buildDir = System.getenv("ANDROID_BUILD_DIR")
if (buildDir != null) {
    layout.buildDirectory = file(buildDir)
} else if (System.getProperty("os.name")?.lowercase()?.contains("linux") == true) {
    layout.buildDirectory = file("/tmp/llamenos-android-build/app")
}

android {
    namespace = "org.llamenos.hotline"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.llamenos.hotline"
        testApplicationId = "org.llamenos.hotline"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "org.llamenos.hotline.CucumberHiltRunner"

        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
        }
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("KEYSTORE_PATH") ?: "release.keystore")
            storePassword = System.getenv("KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("KEY_ALIAS") ?: "llamenos"
            keyPassword = System.getenv("KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Use release signing config when env vars are present (CI),
            // otherwise falls back to debug signing for local builds
            val hasSigningEnv = System.getenv("KEYSTORE_PASSWORD")?.isNotEmpty() == true
            if (hasSigningEnv) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            jniLibs.directories.add("src/main/jniLibs")
            // Include generated protocol types from codegen
            kotlin.srcDir("${rootProject.projectDir}/../../packages/protocol/generated/kotlin")
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

// Copy shared test vectors from packages/crypto for E2E crypto interop tests
val copyTestVectors by tasks.registering(Copy::class) {
    from("${rootProject.projectDir}/../../packages/crypto/tests/fixtures/test-vectors.json")
    into("src/androidTest/assets")
}

// Copy BDD feature files from shared test-specs for Cucumber test runner.
// Only include platform/mobile/ features — core/, security/, admin/, and
// platform/desktop/ features have steps not implemented on Android and
// cause UndefinedStepException crashes even when filtered by @android tag
// (backend+android dual-tagged features still load backend-only steps).
val copyFeatureFiles by tasks.registering(Copy::class) {
    from("${rootProject.projectDir}/../../packages/test-specs/features/platform/mobile")
    into("src/androidTest/assets/features/platform/mobile")
}

tasks.named("preBuild") {
    dependsOn(copyTestVectors)
    dependsOn(copyFeatureFiles)
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material.icons)
    implementation(libs.compose.navigation)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime)
    implementation(libs.lifecycle.viewmodel)
    implementation(libs.core.ktx)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation)

    implementation(libs.okhttp)
    implementation(libs.coroutines.android)
    implementation(libs.coroutines.core)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.datastore.preferences)
    implementation(libs.security.crypto)
    implementation(libs.biometric)

    implementation(libs.firebase.messaging)

    // CameraX for QR code scanning (device linking)
    implementation(libs.camerax.core)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.camerax.view)

    // ML Kit for barcode/QR detection
    implementation(libs.mlkit.barcode)

    // JNA for UniFFI-generated Rust bindings (llamenos-core)
    implementation(libs.jna) { artifact { type = "aar" } }

    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.turbine)
    testImplementation(libs.mockk)

    androidTestImplementation(libs.espresso)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.test.runner)
    androidTestImplementation(libs.test.rules)
    androidTestImplementation(libs.cucumber.android)
}
