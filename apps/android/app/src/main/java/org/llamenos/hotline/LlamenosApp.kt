package org.llamenos.hotline

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import org.llamenos.hotline.api.NetworkMonitor
import javax.inject.Inject

@HiltAndroidApp
class LlamenosApp : Application() {

    @Inject lateinit var crashReporter: CrashReporter
    @Inject lateinit var networkMonitor: NetworkMonitor

    override fun onCreate() {
        super.onCreate()
        instance = this

        crashReporter.install()
        networkMonitor.start()

        // Upload pending crash logs if user has consented (fire-and-forget)
        crashReporter.uploadPendingInBackground()
    }

    companion object {
        lateinit var instance: LlamenosApp
            private set
    }
}
