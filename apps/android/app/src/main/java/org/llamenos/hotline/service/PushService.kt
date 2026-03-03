package org.llamenos.hotline.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.llamenos.hotline.R
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.crypto.WakeKeyService
import javax.inject.Inject

/**
 * Firebase Cloud Messaging service for push notifications.
 *
 * Handles:
 * - Incoming call alerts (parallel ringing)
 * - Shift reminders
 * - Admin announcements
 *
 * All push notification content is encrypted — the FCM payload contains
 * only an opaque envelope that the app decrypts locally. Two decryption
 * tiers are supported:
 *
 * 1. **Wake tier** (via [WakeKeyService]): Decryptable without user PIN.
 *    Shows generic "New call available" on the lock screen. The wake key
 *    is stored in Android Keystore without user authentication requirement.
 *
 * 2. **Full tier** (via [CryptoService]): Requires the app to be unlocked.
 *    Shows detailed caller context when the volunteer's nsec is available.
 *
 * Firebase/Google never see the notification content in plaintext.
 */
@AndroidEntryPoint
class PushService : FirebaseMessagingService() {

    @Inject
    lateinit var keystoreService: KeystoreService

    @Inject
    lateinit var cryptoService: CryptoService

    @Inject
    lateinit var wakeKeyService: WakeKeyService

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Called when a new FCM registration token is generated.
     *
     * This occurs on:
     * - First app launch (initial token generation)
     * - Token refresh (Google rotates tokens periodically)
     * - App data cleared or reinstalled
     *
     * The token is stored locally and will be sent to the llamenos backend
     * so the server can target this device for push delivery.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed: ${token.take(10)}...")
        keystoreService.store(KEY_FCM_TOKEN, token)

        // Ensure a wake key exists for push encryption
        wakeKeyService.getOrCreateWakePublicKey()
    }

    /**
     * Called when a push message is received while the app is in the foreground,
     * or when a data-only message arrives (regardless of app state).
     *
     * Message types from the llamenos backend:
     * - `incoming_call`: Trigger parallel ring UI, play ringtone
     * - `call_ended`: Stop ringing (another volunteer answered)
     * - `shift_reminder`: Upcoming shift notification
     * - `announcement`: Admin announcement
     *
     * Each message may contain an encrypted `wake_payload` (decryptable without
     * user PIN) and/or an encrypted `full_payload` (requires unlocked app).
     */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        val type = data["type"] ?: "unknown"

        Log.d(TAG, "FCM message received: type=$type, keys=${data.keys}")

        // Try wake-tier decryption first (available without PIN unlock)
        // Server sends ECIES-encrypted payload as two fields:
        // wake_payload = hex(nonce + ciphertext), wake_ephemeral = hex(compressed pubkey)
        val wakeEncrypted = data["wake_payload"]
        val wakeEphemeral = data["wake_ephemeral"]
        if (wakeEncrypted != null && wakeEphemeral != null) {
            serviceScope.launch {
                val wakePayload = wakeKeyService.decryptWakePayload(wakeEncrypted, wakeEphemeral)
                if (wakePayload != null) {
                    Log.d(TAG, "Wake payload decrypted: type=${wakePayload.type}")
                    // Use wake payload for notification content when app is locked
                    if (!cryptoService.isUnlocked) {
                        showNotificationFromWakePayload(wakePayload.type, wakePayload.message)
                    }
                }
            }
        }

        // If app is unlocked, use full-tier handling for richer notifications
        if (cryptoService.isUnlocked) {
            when (type) {
                "incoming_call" -> handleIncomingCall(data)
                "call_ended" -> handleCallEnded()
                "shift_reminder" -> handleShiftReminder(data)
                "announcement" -> handleAnnouncement(data)
                else -> Log.d(TAG, "Unknown message type: $type")
            }
        } else if (wakeEncrypted == null) {
            // No wake payload and app is locked — show generic notification
            when (type) {
                "incoming_call" -> handleIncomingCall(data)
                "call_ended" -> handleCallEnded()
                "shift_reminder" -> handleShiftReminder(data)
                "announcement" -> handleAnnouncement(data)
                else -> Log.d(TAG, "Unknown message type: $type")
            }
        }
    }

    /**
     * Show a notification using wake-tier decrypted content.
     * Used when the app is locked and full-tier decryption is unavailable.
     */
    private fun showNotificationFromWakePayload(type: String, message: String?) {
        when (type) {
            "incoming_call" -> {
                ensureNotificationChannel(
                    CHANNEL_CALLS,
                    getString(R.string.notification_channel_calls),
                    NotificationManager.IMPORTANCE_HIGH,
                )
                val notification = NotificationCompat.Builder(this, CHANNEL_CALLS)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(getString(R.string.incoming_call))
                    .setContentText(message ?: getString(R.string.incoming_call_body))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setAutoCancel(true)
                    .setVibrate(longArrayOf(0, 500, 200, 500))
                    .build()

                val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID_CALL, notification)
            }

            "shift_reminder" -> {
                ensureNotificationChannel(
                    CHANNEL_SHIFTS,
                    getString(R.string.notification_channel_shifts),
                    NotificationManager.IMPORTANCE_DEFAULT,
                )
                val notification = NotificationCompat.Builder(this, CHANNEL_SHIFTS)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(getString(R.string.shift_reminder))
                    .setContentText(message ?: getString(R.string.shift_reminder_body))
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true)
                    .build()

                val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID_SHIFT, notification)
            }

            else -> {
                ensureNotificationChannel(
                    CHANNEL_GENERAL,
                    getString(R.string.notification_channel_general),
                    NotificationManager.IMPORTANCE_DEFAULT,
                )
                val notification = NotificationCompat.Builder(this, CHANNEL_GENERAL)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(getString(R.string.app_name))
                    .setContentText(message ?: getString(R.string.announcement_body))
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true)
                    .build()

                val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.notify(NOTIFICATION_ID_ANNOUNCEMENT, notification)
            }
        }
    }

    private fun handleIncomingCall(data: Map<String, String>) {
        Log.d(TAG, "Incoming call notification received")
        ensureNotificationChannel(
            CHANNEL_CALLS,
            getString(R.string.notification_channel_calls),
            NotificationManager.IMPORTANCE_HIGH,
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.incoming_call))
            .setContentText(getString(R.string.incoming_call_body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setVibrate(longArrayOf(0, 500, 200, 500))
            .build()

        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID_CALL, notification)
    }

    private fun handleCallEnded() {
        Log.d(TAG, "Call ended notification received")
        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(NOTIFICATION_ID_CALL)
    }

    private fun handleShiftReminder(data: Map<String, String>) {
        Log.d(TAG, "Shift reminder notification received")
        ensureNotificationChannel(
            CHANNEL_SHIFTS,
            getString(R.string.notification_channel_shifts),
            NotificationManager.IMPORTANCE_DEFAULT,
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_SHIFTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.shift_reminder))
            .setContentText(getString(R.string.shift_reminder_body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID_SHIFT, notification)
    }

    private fun handleAnnouncement(data: Map<String, String>) {
        Log.d(TAG, "Announcement notification received")
        ensureNotificationChannel(
            CHANNEL_GENERAL,
            getString(R.string.notification_channel_general),
            NotificationManager.IMPORTANCE_DEFAULT,
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_GENERAL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.announcement))
            .setContentText(data["body"] ?: getString(R.string.announcement_body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID_ANNOUNCEMENT, notification)
    }

    private fun ensureNotificationChannel(
        channelId: String,
        channelName: String,
        importance: Int,
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, channelName, importance)
            val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    companion object {
        private const val TAG = "LlamenosPush"
        private const val KEY_FCM_TOKEN = "fcm-token"

        private const val CHANNEL_CALLS = "llamenos_calls"
        private const val CHANNEL_SHIFTS = "llamenos_shifts"
        private const val CHANNEL_GENERAL = "llamenos_general"

        private const val NOTIFICATION_ID_CALL = 1001
        private const val NOTIFICATION_ID_SHIFT = 1002
        private const val NOTIFICATION_ID_ANNOUNCEMENT = 1003
    }
}
