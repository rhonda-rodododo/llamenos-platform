package org.llamenos.hotline

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.api.NetworkMonitor
import org.llamenos.hotline.service.OfflineQueue
import org.llamenos.hotline.telephony.LinphoneService
import javax.inject.Inject

@HiltAndroidApp
class LlamenosApp : Application() {

    @Inject lateinit var crashReporter: CrashReporter
    @Inject lateinit var networkMonitor: NetworkMonitor
    @Inject lateinit var offlineQueue: OfflineQueue
    @Inject lateinit var apiService: ApiService
    @Inject lateinit var linphoneService: LinphoneService

    override fun onCreate() {
        super.onCreate()
        instance = this

        crashReporter.install()
        networkMonitor.start()
        linphoneService.initialize()

        // Wire offline queue: set apiService reference and start connectivity monitoring
        offlineQueue.apiService = apiService
        apiService.offlineQueue = offlineQueue
        offlineQueue.startMonitoring()

        // Upload pending crash logs if user has consented (fire-and-forget)
        crashReporter.uploadPendingInBackground()
    }

    companion object {
        lateinit var instance: LlamenosApp
            private set
    }
}
