package org.llamenos.hotline.telephony

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.linphone.core.Call
import org.linphone.core.Core
import org.linphone.core.CoreListenerStub
import org.linphone.core.Factory
import org.linphone.core.MediaEncryption
import org.llamenos.hotline.di.ApplicationScope
import org.llamenos.hotline.hub.ActiveHubState
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

data class SipTokenResponse(
    val username: String,
    val domain: String,
    val password: String,
    val transport: String,
    val expiry: Int,
)

@Singleton
class LinphoneService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val activeHubState: ActiveHubState,
    @ApplicationScope private val scope: CoroutineScope,
) {
    private var core: Core? = null
    private val hubAccounts = ConcurrentHashMap<String, org.linphone.core.Account>()
    // TODO: Add eviction (e.g. LruCache) for entries that are never consumed
    // (call push arrives but Linphone never connects). Low risk for now given
    // low per-session call volume on a crisis line.
    private val pendingCallHubIds = ConcurrentHashMap<String, String>()  // callId → hubId

    fun initialize() {
        try {
            val factory = Factory.instance()
            val core = factory.createCore(null, null, context)
            core.isCallkitEnabled = true
            core.mediaEncryption = MediaEncryption.SRTP
            core.isMediaEncryptionMandatory = true

            core.audioPayloadTypes.forEach { pt ->
                pt.enable(pt.mimeType == "opus" || pt.mimeType == "PCMU")
            }

            setupCoreListener(core)
            core.start()
            this.core = core
            Log.i("LinphoneService", "Linphone Core initialized successfully")
        } catch (e: Exception) {
            Log.e("LinphoneService", "Failed to initialize Linphone Core: ${e.message}")
        }
    }

    fun registerHubAccount(hubId: String, sipParams: SipTokenResponse) {
        val core = this.core ?: run {
            Log.w("LinphoneService", "Core not initialized — cannot register SIP account for $hubId")
            return
        }
        try {
            val params = core.createAccountParams()
            val identity = Factory.instance().createAddress(
                "sip:${sipParams.username}@${sipParams.domain}"
            )
            params.identityAddress = identity
            val server = Factory.instance().createAddress(
                "sip:${sipParams.domain};transport=${sipParams.transport}"
            )
            params.serverAddress = server
            params.isRegisterEnabled = true
            val account = core.createAccount(params)
            core.addAccount(account)
            hubAccounts[hubId] = account
            Log.i("LinphoneService", "Registered SIP account for hub $hubId")
        } catch (e: Exception) {
            Log.e("LinphoneService", "Failed to register SIP account for $hubId: ${e.message}")
        }
    }

    fun unregisterHubAccount(hubId: String) {
        val account = hubAccounts.remove(hubId) ?: return
        core?.removeAccount(account)
        Log.i("LinphoneService", "Unregistered SIP account for hub $hubId")
    }

    fun storePendingCallHub(callId: String, hubId: String) {
        pendingCallHubIds[callId] = hubId
    }

    private fun setupCoreListener(core: Core) {
        core.addListener(object : CoreListenerStub() {
            override fun onCallStateChanged(
                core: Core,
                call: Call,
                state: Call.State,
                message: String,
            ) {
                val callId = call.callLog?.callId ?: return
                when (state) {
                    Call.State.IncomingReceived -> {
                        pendingCallHubIds.remove(callId)?.let { hubId ->
                            scope.launch { activeHubState.setActiveHub(hubId) }
                        }
                    }
                    Call.State.Released, Call.State.End -> {
                        pendingCallHubIds.remove(callId)
                    }
                    else -> {}
                }
            }
        })
    }

    internal fun pendingCallHubIdForTesting(callId: String): String? = pendingCallHubIds[callId]
    internal fun consumePendingCallHubForTesting(callId: String) { pendingCallHubIds.remove(callId) }
}
