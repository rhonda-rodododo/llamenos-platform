package org.llamenos.hotline.ui.settings

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import org.llamenos.hotline.R
import java.util.concurrent.Executors

/**
 * Device linking screen using CameraX for QR code scanning.
 *
 * Implements a multi-step wizard:
 * 1. Scan: CameraX preview with QR code detection
 * 2. Connect: Progress indicator while joining provisioning room
 * 3. Verify: Large SAS code display for user comparison
 * 4. Import: Progress indicator while receiving identity
 * 5. Complete: Success confirmation
 *
 * Camera permission is requested at the start of the flow.
 *
 * @param onNavigateBack Callback to navigate back to settings
 */
@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceLinkScreen(
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DeviceLinkViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA,
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    // Request camera permission on first launch
    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.device_link_title),
                        modifier = Modifier.testTag("device-link-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            viewModel.cancel()
                            onNavigateBack()
                        },
                        modifier = Modifier.testTag("device-link-back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.nav_dashboard),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        modifier = modifier,
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            // Step indicator
            StepIndicator(
                currentStep = uiState.step,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .testTag("step-indicator"),
            )

            // Content based on current step
            when (uiState.step) {
                DeviceLinkStep.SCANNING -> {
                    if (hasCameraPermission) {
                        QRScannerContent(
                            onQRScanned = { viewModel.onQRCodeScanned(it) },
                            modifier = Modifier
                                .fillMaxSize()
                                .testTag("scanner-content"),
                        )
                    } else {
                        // Camera permission not granted
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(32.dp)
                                .testTag("camera-permission-needed"),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.CameraAlt,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                            )
                            Spacer(Modifier.height(16.dp))
                            Text(
                                text = stringResource(R.string.device_link_camera_permission),
                                style = MaterialTheme.typography.bodyLarge,
                                textAlign = TextAlign.Center,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(16.dp))
                            Button(
                                onClick = {
                                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                                },
                                modifier = Modifier.testTag("request-camera-button"),
                            ) {
                                Text("Grant Camera Permission")
                            }
                        }
                    }
                }

                DeviceLinkStep.CONNECTING -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp)
                            .testTag("connecting-content"),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(64.dp),
                        )
                        Spacer(Modifier.height(24.dp))
                        Text(
                            text = stringResource(R.string.device_link_connecting),
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                }

                DeviceLinkStep.VERIFYING -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp)
                            .testTag("verify-content"),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = stringResource(R.string.device_link_verify),
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = stringResource(R.string.device_link_verify_subtitle),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )

                        Spacer(Modifier.height(32.dp))

                        // Large SAS code display
                        Text(
                            text = uiState.sasCode.chunked(3).joinToString(" "),
                            style = MaterialTheme.typography.displayLarge.copy(
                                fontFamily = FontFamily.Monospace,
                                letterSpacing = 8.sp,
                            ),
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier
                                .border(
                                    width = 2.dp,
                                    color = MaterialTheme.colorScheme.primary,
                                    shape = RoundedCornerShape(16.dp),
                                )
                                .padding(horizontal = 32.dp, vertical = 24.dp)
                                .testTag("sas-code"),
                        )

                        Spacer(Modifier.height(32.dp))

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            OutlinedButton(
                                onClick = { viewModel.cancel() },
                                modifier = Modifier.testTag("cancel-verify-button"),
                            ) {
                                Text(stringResource(android.R.string.cancel))
                            }
                            Button(
                                onClick = { viewModel.confirmSASCode() },
                                modifier = Modifier.testTag("confirm-verify-button"),
                            ) {
                                Text("Codes Match")
                            }
                        }
                    }
                }

                DeviceLinkStep.IMPORTING -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp)
                            .testTag("importing-content"),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(64.dp),
                        )
                        Spacer(Modifier.height(24.dp))
                        Text(
                            text = stringResource(R.string.device_link_importing),
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                }

                DeviceLinkStep.COMPLETE -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp)
                            .testTag("complete-content"),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(80.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.height(24.dp))
                        Text(
                            text = stringResource(R.string.device_link_complete),
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Spacer(Modifier.height(24.dp))
                        Button(
                            onClick = onNavigateBack,
                            modifier = Modifier.testTag("done-button"),
                        ) {
                            Text("Done")
                        }
                    }
                }

                DeviceLinkStep.ERROR -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp)
                            .testTag("error-content"),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Error,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.height(24.dp))
                        Text(
                            text = uiState.error ?: "An error occurred",
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.testTag("error-message"),
                        )
                        Spacer(Modifier.height(24.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            OutlinedButton(
                                onClick = {
                                    viewModel.cancel()
                                    onNavigateBack()
                                },
                                modifier = Modifier.testTag("error-cancel-button"),
                            ) {
                                Text(stringResource(android.R.string.cancel))
                            }
                            Button(
                                onClick = { viewModel.retry() },
                                modifier = Modifier.testTag("retry-button"),
                            ) {
                                Text("Retry")
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Step indicator showing progress through the device linking flow.
 */
@Composable
private fun StepIndicator(
    currentStep: DeviceLinkStep,
    modifier: Modifier = Modifier,
) {
    val steps = listOf(
        stringResource(R.string.device_link_step_scan),
        stringResource(R.string.device_link_step_verify),
        stringResource(R.string.device_link_step_import),
    )
    val stepIndex = when (currentStep) {
        DeviceLinkStep.SCANNING -> 0
        DeviceLinkStep.CONNECTING -> 0
        DeviceLinkStep.VERIFYING -> 1
        DeviceLinkStep.IMPORTING -> 2
        DeviceLinkStep.COMPLETE -> 3
        DeviceLinkStep.ERROR -> -1
    }

    Column(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            steps.forEachIndexed { index, label ->
                Text(
                    text = "${index + 1}. $label",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (index == stepIndex) FontWeight.Bold else FontWeight.Normal,
                    color = when {
                        index < stepIndex -> MaterialTheme.colorScheme.primary
                        index == stepIndex -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    },
                    modifier = Modifier.testTag("step-label-$index"),
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        LinearProgressIndicator(
            progress = {
                when (stepIndex) {
                    -1 -> 0f
                    0 -> 0.1f
                    1 -> 0.5f
                    2 -> 0.8f
                    3 -> 1f
                    else -> 0f
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(4.dp))
                .testTag("step-progress"),
        )
    }
}

/**
 * CameraX preview with QR code scanning.
 *
 * Uses ML Kit Barcode Scanning for QR detection. The camera preview is
 * displayed with a viewfinder overlay.
 */
@OptIn(ExperimentalGetImage::class)
@Composable
private fun QRScannerContent(
    onQRScanned: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var hasScanned by remember { mutableStateOf(false) }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.device_link_scan),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("scan-instructions"),
        )

        // Camera preview
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(16.dp)
                .clip(RoundedCornerShape(16.dp))
                .testTag("camera-preview-container"),
            contentAlignment = Alignment.Center,
        ) {
            AndroidView(
                factory = { ctx ->
                    val previewView = PreviewView(ctx).apply {
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }

                    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                    cameraProviderFuture.addListener({
                        val cameraProvider = cameraProviderFuture.get()

                        val preview = Preview.Builder()
                            .build()
                            .also { it.surfaceProvider = previewView.surfaceProvider }

                        val imageAnalysis = ImageAnalysis.Builder()
                            .setResolutionSelector(
                                androidx.camera.core.resolutionselector.ResolutionSelector.Builder()
                                    .setAspectRatioStrategy(
                                        androidx.camera.core.resolutionselector.AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY
                                    )
                                    .build()
                            )
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()

                        val scanner = BarcodeScanning.getClient()
                        val executor = Executors.newSingleThreadExecutor()

                        imageAnalysis.setAnalyzer(executor) { imageProxy ->
                            val mediaImage = imageProxy.image
                            if (mediaImage != null && !hasScanned) {
                                val inputImage = InputImage.fromMediaImage(
                                    mediaImage,
                                    imageProxy.imageInfo.rotationDegrees,
                                )

                                scanner.process(inputImage)
                                    .addOnSuccessListener { barcodes ->
                                        for (barcode in barcodes) {
                                            if (barcode.format == Barcode.FORMAT_QR_CODE) {
                                                val value = barcode.rawValue
                                                if (value != null && !hasScanned) {
                                                    hasScanned = true
                                                    onQRScanned(value)
                                                }
                                            }
                                        }
                                    }
                                    .addOnCompleteListener {
                                        imageProxy.close()
                                    }
                            } else {
                                imageProxy.close()
                            }
                        }

                        try {
                            cameraProvider.unbindAll()
                            cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                CameraSelector.DEFAULT_BACK_CAMERA,
                                preview,
                                imageAnalysis,
                            )
                        } catch (_: Exception) {
                            // Camera initialization can fail on some devices
                        }
                    }, ContextCompat.getMainExecutor(ctx))

                    previewView
                },
                modifier = Modifier.fillMaxSize(),
            )

            // Viewfinder overlay
            Box(
                modifier = Modifier
                    .size(250.dp)
                    .border(
                        width = 3.dp,
                        color = MaterialTheme.colorScheme.primary,
                        shape = RoundedCornerShape(16.dp),
                    )
                    .testTag("viewfinder"),
            )
        }

        // QR scanner icon
        Icon(
            imageVector = Icons.Filled.QrCodeScanner,
            contentDescription = null,
            modifier = Modifier
                .size(32.dp)
                .padding(bottom = 16.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
