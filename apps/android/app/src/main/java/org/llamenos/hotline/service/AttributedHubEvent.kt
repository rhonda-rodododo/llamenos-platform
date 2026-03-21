package org.llamenos.hotline.service

/**
 * Wraps a real-time event with the hub ID that was active when the event arrived.
 *
 * ViewModels receive [AttributedHubEvent] from [org.llamenos.hotline.api.WebSocketService]
 * and can use [hubId] to route events to the correct hub-scoped state, or discard events
 * that don't belong to the currently active hub.
 *
 * @param T the underlying event type (e.g. [org.llamenos.hotline.model.LlamenosEvent])
 * @property hubId the active hub ID at the time the event was received; empty string if none
 * @property event the underlying event payload
 */
data class AttributedHubEvent<out T>(
    val hubId: String,
    val event: T,
)
