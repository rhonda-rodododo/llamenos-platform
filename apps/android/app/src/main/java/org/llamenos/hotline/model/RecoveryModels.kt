package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

@Serializable
data class RecoveryGroupInfo(
    val publicKey: String,
    val threshold: Int,
    val totalShares: Int,
    val commitments: List<String>,
    val sigchainLinkHash: String,
    val delayHours: Int,
    val emergencyFloorHours: Int,
    val createdAt: String,
    val rotatedAt: String? = null,
    val shareHolderLiveness: List<ShareHolderLiveness>,
)

typealias ShareHolderLiveness = org.llamenos.protocol.ShareHolderLiveness

@Serializable
data class RecoverySessionStatus(
    val sessionId: String,
    val hubId: String,
    val userPubkey: String,
    val newDevicePubkey: String,
    val status: String,
    val contributionCount: Int,
    val threshold: Int,
    val delayRemainingMs: Long? = null,
    val expiresAt: String,
    val createdAt: String,
    val contributions: List<RecoveryContribution>? = null,
    val emergencyOverride: RecoveryEmergencyOverride? = null,
)

typealias RecoveryContribution = org.llamenos.protocol.Contribution

typealias RecoveryEmergencyOverride = org.llamenos.protocol.RecoveryEmergencyOverride

@Serializable
data class RecoveryInitiateRequest(
    val hubId: String,
    val userIdentifier: String,
    val newDevicePubkey: String,
)

typealias RecoveryInitiateResponse = org.llamenos.protocol.RecoveryInitiateResponse

@Serializable
data class RecoveryVerifyRequest(
    val sessionId: String,
    val verificationCode: String,
)

@Serializable
data class RecoveryVerifyResponse(
    val ok: Boolean,
    val expiresAt: String,
)

@Serializable
data class RecoveryContributeRequest(
    val encryptedShare: String,
    val contributorSignature: String,
)

@Serializable
data class RecoveryContributeResponse(
    val ok: Boolean,
    val status: String,
    val contributionCount: Int,
)

@Serializable
data class RecoveryEnvelopeRequest(
    val hubId: String,
    val envelope: String,
)

@Serializable
data class RecoveryLivenessRequest(
    val hubId: String,
    val proof: String,
)

@Serializable
data class OkResponse(
    val ok: Boolean,
)

@Serializable
data class RecoveryEnrollRequest(
    val threshold: Int,
    val totalShares: Int,
    val groupPublicKey: String,
    val shareEnvelopes: List<ShareEnvelopeEntry>,
    val shareCommitments: List<String>,
    val duressCommitments: List<String?>? = null,
    val sigchainLinkHash: String,
    val delayHours: Int? = null,
    val emergencyFloorHours: Int? = null,
)

@Serializable
data class ShareEnvelopeEntry(
    val holderPubkey: String,
    val shareEnvelope: String,
)
