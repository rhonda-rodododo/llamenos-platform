package org.llamenos.hotline.ui.providersetup

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.R
import org.llamenos.protocol.AvailableNumber
import org.llamenos.protocol.OwnedNumber

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhoneNumberScreen(
    provider: String,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PhoneNumberViewModel = hiltViewModel(),
) {
    val ownedNumbers by viewModel.ownedNumbers.collectAsState()
    val isLoadingOwned by viewModel.isLoadingOwned.collectAsState()
    val ownedError by viewModel.ownedError.collectAsState()
    val searchResults by viewModel.searchResults.collectAsState()
    val isSearching by viewModel.isSearching.collectAsState()
    val searchError by viewModel.searchError.collectAsState()
    val isProvisioning by viewModel.isProvisioning.collectAsState()
    val provisionError by viewModel.provisionError.collectAsState()
    val provisionSuccess by viewModel.provisionSuccess.collectAsState()

    var selectedTab by remember { mutableStateOf(0) }
    var showProvisionDialog by remember { mutableStateOf(false) }
    var selectedNumber by remember { mutableStateOf<AvailableNumber?>(null) }

    LaunchedEffect(provider) {
        viewModel.loadOwnedNumbers(provider)
    }

    if (provisionSuccess != null) {
        AlertDialog(
            onDismissRequest = { viewModel.clearProvisionSuccess() },
            title = { Text(stringResource(R.string.provision_success_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.provision_success_message,
                        provisionSuccess?.phoneNumber ?: "",
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.clearProvisionSuccess() }) {
                    Text(stringResource(R.string.ok))
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.phone_numbers_title),
                        modifier = Modifier.testTag("phone-numbers-title"),
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.nav_dashboard),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onSecondaryContainer,
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
            TabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text(stringResource(R.string.owned_numbers_tab)) },
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text(stringResource(R.string.search_numbers_tab)) },
                )
            }

            when (selectedTab) {
                0 -> OwnedNumbersTab(
                    numbers = ownedNumbers,
                    isLoading = isLoadingOwned,
                    error = ownedError,
                    onRefresh = { viewModel.loadOwnedNumbers(provider) },
                )
                1 -> SearchNumbersTab(
                    results = searchResults,
                    isSearching = isSearching,
                    error = searchError,
                    onSearch = { country, areaCode, contains ->
                        viewModel.searchNumbers(provider, country, areaCode, contains)
                    },
                    onSelectNumber = { number ->
                        selectedNumber = number
                        showProvisionDialog = true
                    },
                )
            }
        }
    }

    if (showProvisionDialog && selectedNumber != null) {
        AlertDialog(
            onDismissRequest = {
                showProvisionDialog = false
                selectedNumber = null
            },
            title = { Text(stringResource(R.string.provision_number_title)) },
            text = {
                Column {
                    Text(
                        stringResource(
                            R.string.provision_number_confirm,
                            selectedNumber?.phoneNumber ?: "",
                        ),
                    )
                    provisionError?.let { error ->
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = error,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        selectedNumber?.let { number ->
                            viewModel.provisionNumber(
                                phoneNumber = number.phoneNumber,
                                provider = provider,
                            )
                        }
                        showProvisionDialog = false
                        selectedNumber = null
                    },
                    enabled = !isProvisioning,
                ) {
                    if (isProvisioning) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp))
                    } else {
                        Text(stringResource(R.string.provision_button))
                    }
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = {
                        showProvisionDialog = false
                        selectedNumber = null
                        viewModel.clearProvisionError()
                    },
                ) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

@Composable
private fun OwnedNumbersTab(
    numbers: List<OwnedNumber>,
    isLoading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else if (error != null) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = onRefresh) {
                    Text(stringResource(R.string.retry))
                }
            }
        } else if (numbers.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.no_owned_numbers),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(numbers, key = { it.id }) { number ->
                    OwnedNumberCard(number = number)
                }
            }
        }
    }
}

@Composable
private fun OwnedNumberCard(number: OwnedNumber) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("owned-number-${number.id}"),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.Phone,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = number.phoneNumber,
                    style = MaterialTheme.typography.titleMedium,
                )
                number.friendlyName?.let { name ->
                    Text(
                        text = name,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = number.capabilities.joinToString(", "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun SearchNumbersTab(
    results: List<AvailableNumber>,
    isSearching: Boolean,
    error: String?,
    onSearch: (country: String, areaCode: String?, contains: String?) -> Unit,
    onSelectNumber: (AvailableNumber) -> Unit,
) {
    var countryCode by remember { mutableStateOf("US") }
    var areaCode by remember { mutableStateOf("") }
    var contains by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        OutlinedTextField(
            value = countryCode,
            onValueChange = { countryCode = it.uppercase() },
            label = { Text(stringResource(R.string.country_code_label)) },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(
                imeAction = ImeAction.Next,
            ),
            singleLine = true,
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = areaCode,
            onValueChange = { areaCode = it.filter { c -> c.isDigit() } },
            label = { Text(stringResource(R.string.area_code_label)) },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Next,
            ),
            singleLine = true,
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = contains,
            onValueChange = { contains = it.filter { c -> c.isDigit() } },
            label = { Text(stringResource(R.string.contains_label)) },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Search,
            ),
            singleLine = true,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = {
                onSearch(
                    countryCode,
                    areaCode.takeIf { it.isNotBlank() },
                    contains.takeIf { it.isNotBlank() },
                )
            },
            enabled = !isSearching && countryCode.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (isSearching) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp))
            } else {
                Icon(Icons.Filled.Search, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.search_button))
            }
        }

        error?.let {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = it,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        results.forEach { number ->
            AvailableNumberCard(
                number = number,
                onClick = { onSelectNumber(number) },
            )
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun AvailableNumberCard(
    number: AvailableNumber,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("available-number-${number.phoneNumber}"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = number.phoneNumber,
                    style = MaterialTheme.typography.titleMedium,
                )
                number.locality?.let { locality ->
                    Text(
                        text = locality,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                number.monthlyPrice?.let { price ->
                    Text(
                        text = price,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Text(
                    text = number.capabilities.joinToString(", "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                imageVector = Icons.Filled.Add,
                contentDescription = stringResource(R.string.select_number),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
