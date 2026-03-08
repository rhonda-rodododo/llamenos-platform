# Epic 292: Offline Resilience & Sync

**Status**: PENDING
**Priority**: Medium
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Add an offline operation queue to all three clients (Desktop, iOS, Android) so that write operations (note create/edit, message send, shift clock-in/out) are queued when the device is offline and replayed in order when connectivity returns. Add visual offline indicators to iOS (Android and Desktop already have them). Improve Nostr relay reconnection to buffer missed events and request replay on reconnect.

## Problem Statement

When a volunteer's network drops during a shift:

1. **Note creation fails silently or with an error toast** — the volunteer may lose their notes entirely if they don't notice the failure.
2. **Message sends fail** — inbound messages from callers via SMS/WhatsApp/Signal are not visible until reconnect, and outbound replies are lost.
3. **Shift clock-in/out fails** — the volunteer may think they clocked in but the server never received the request.
4. **Nostr relay disconnection loses events** — real-time updates (new calls, notes from other volunteers, admin broadcasts) are missed during the disconnection window. The existing reconnection logic reconnects the WebSocket but does not replay missed events.

For a crisis hotline, network drops during active calls are a real scenario — volunteers in areas with spotty connectivity, or when switching between WiFi and cellular. The app must handle this gracefully without data loss.

## Implementation

### 1. Offline Queue: Core Design

Each platform implements a persistent operation queue that stores serialized operations when the network is unavailable. On reconnect, the queue replays operations in FIFO order with exponential backoff on individual failures.

**Queue entry structure** (consistent across platforms):

```typescript
interface QueuedOperation {
  id: string              // UUID
  type: 'note-create' | 'note-edit' | 'message-send' | 'shift-toggle' | 'draft-save'
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string            // API path (e.g., /api/notes)
  body: string            // JSON-serialized request body
  headers: Record<string, string>  // Auth headers at time of queueing
  createdAt: number       // Timestamp (ms)
  retryCount: number      // Number of replay attempts
  maxRetries: number      // Default 5
}
```

**Conflict resolution**: Server wins. If a note was edited by another volunteer while offline, the offline edit is rejected (409 Conflict). The client shows a conflict resolution dialog with both versions.

### 2. Desktop: Tauri Store Queue

**File: `src/client/lib/offline-queue.ts`**:

```typescript
import { Store } from '@tauri-apps/plugin-store'

const QUEUE_KEY = 'offline-queue'
const MAX_QUEUE_SIZE = 100

export class OfflineQueue {
  private store: Store | null = null
  private processing = false

  async init() {
    const { Store: TauriStore } = await import('@tauri-apps/plugin-store')
    this.store = await TauriStore.load('offline-queue.json')
  }

  async enqueue(op: Omit<QueuedOperation, 'id' | 'createdAt' | 'retryCount'>): Promise<void> {
    const queue = await this.getQueue()
    if (queue.length >= MAX_QUEUE_SIZE) {
      throw new Error('Offline queue full — please reconnect to sync')
    }

    const entry: QueuedOperation = {
      ...op,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: op.maxRetries ?? 5,
    }

    queue.push(entry)
    await this.store?.set(QUEUE_KEY, queue)
    await this.store?.save()
  }

  async replay(): Promise<{ succeeded: number; failed: number }> {
    if (this.processing) return { succeeded: 0, failed: 0 }
    this.processing = true

    const queue = await this.getQueue()
    let succeeded = 0
    let failed = 0
    const remaining: QueuedOperation[] = []

    for (const op of queue) {
      try {
        const res = await fetch(`/api${op.path}`, {
          method: op.method,
          headers: {
            'Content-Type': 'application/json',
            ...op.headers,
          },
          body: op.body,
        })

        if (res.ok || res.status === 409) {
          // 409 = conflict, but operation was received — don't retry
          succeeded++
          if (res.status === 409) {
            window.dispatchEvent(new CustomEvent('llamenos:sync-conflict', {
              detail: { operationId: op.id, type: op.type }
            }))
          }
        } else if (res.status >= 500) {
          // Server error — retry later
          op.retryCount++
          if (op.retryCount < op.maxRetries) {
            remaining.push(op)
          } else {
            failed++
          }
        } else {
          // Client error (400, 403, etc.) — don't retry
          failed++
        }
      } catch {
        // Network still down — stop replay, keep remaining
        remaining.push(op, ...queue.slice(queue.indexOf(op) + 1))
        break
      }
    }

    await this.store?.set(QUEUE_KEY, remaining)
    await this.store?.save()
    this.processing = false

    return { succeeded, failed }
  }

  async getQueue(): Promise<QueuedOperation[]> {
    return (await this.store?.get<QueuedOperation[]>(QUEUE_KEY)) ?? []
  }

  async getQueueSize(): Promise<number> {
    return (await this.getQueue()).length
  }

  async clear(): Promise<void> {
    await this.store?.set(QUEUE_KEY, [])
    await this.store?.save()
  }
}

export const offlineQueue = new OfflineQueue()
```

**File: `src/client/lib/api.ts`** — Integrate queue into the `request()` function:

```typescript
import { offlineQueue } from './offline-queue'

// In request(), when fetch throws (network error) and operation is queueable:
const QUEUEABLE_TYPES = new Set(['POST', 'PUT', 'PATCH'])

// Catch block in request():
if (!navigator.onLine && QUEUEABLE_TYPES.has(method)) {
  await offlineQueue.enqueue({
    type: inferOperationType(path, method),
    method: method as 'POST' | 'PUT' | 'PATCH',
    path,
    body: JSON.stringify(options.body),
    headers: authHeaders,
    maxRetries: 5,
  })
  // Return a synthetic "queued" response so the UI can show feedback
  return { _queued: true, queueId: crypto.randomUUID() } as T
}
```

**File: `src/client/components/offline-banner.tsx`** — Enhance existing banner with queue count:

```tsx
// Add queue count indicator:
const [queueSize, setQueueSize] = useState(0)

useEffect(() => {
  if (isOffline) {
    const interval = setInterval(async () => {
      const size = await offlineQueue.getQueueSize()
      setQueueSize(size)
    }, 2000)
    return () => clearInterval(interval)
  }
}, [isOffline])

// Show: "You are offline. 3 operations queued."
```

**File: `src/client/routes/__root.tsx`** — Wire reconnect replay:

```typescript
// Listen for online event and replay queue
useEffect(() => {
  const handleOnline = async () => {
    const result = await offlineQueue.replay()
    if (result.succeeded > 0) {
      toast.success(`Synced ${result.succeeded} queued operations`)
    }
    if (result.failed > 0) {
      toast.error(`${result.failed} operations failed to sync`)
    }
  }
  window.addEventListener('online', handleOnline)
  return () => window.removeEventListener('online', handleOnline)
}, [])
```

### 3. iOS: UserDefaults Queue

**File: `apps/ios/Sources/Services/OfflineQueue.swift`**:

```swift
import Foundation

struct QueuedOperation: Codable, Identifiable {
    let id: String
    let type: String    // "note-create", "message-send", etc.
    let method: String  // "POST", "PUT", "PATCH"
    let path: String
    let body: Data
    let createdAt: Date
    var retryCount: Int
    let maxRetries: Int

    init(type: String, method: String, path: String, body: Data, maxRetries: Int = 5) {
        self.id = UUID().uuidString
        self.type = type
        self.method = method
        self.path = path
        self.body = body
        self.createdAt = Date()
        self.retryCount = 0
        self.maxRetries = maxRetries
    }
}

@Observable
final class OfflineQueue {
    private(set) var queue: [QueuedOperation] = []
    private(set) var isReplaying = false

    private let storageKey = "llamenos.offline-queue"
    private let maxQueueSize = 100
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var queueCount: Int { queue.count }

    init() {
        load()
    }

    func enqueue(_ operation: QueuedOperation) throws {
        guard queue.count < maxQueueSize else {
            throw OfflineQueueError.queueFull
        }
        queue.append(operation)
        save()
    }

    func replay(using apiService: APIService) async -> (succeeded: Int, failed: Int) {
        guard !isReplaying else { return (0, 0) }
        isReplaying = true
        defer { isReplaying = false }

        var succeeded = 0
        var failed = 0
        var remaining: [QueuedOperation] = []

        for var op in queue {
            do {
                let statusCode = try await apiService.rawRequest(
                    method: op.method,
                    path: op.path,
                    body: op.body
                )
                if statusCode >= 200 && statusCode < 300 || statusCode == 409 {
                    succeeded += 1
                } else if statusCode >= 500 {
                    op.retryCount += 1
                    if op.retryCount < op.maxRetries {
                        remaining.append(op)
                    } else {
                        failed += 1
                    }
                } else {
                    failed += 1
                }
            } catch {
                // Network still down — keep remaining
                remaining.append(op)
                remaining.append(contentsOf: queue.suffix(from: queue.firstIndex(where: { $0.id == op.id })! + 1))
                break
            }
        }

        queue = remaining
        save()
        return (succeeded, failed)
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let loaded = try? decoder.decode([QueuedOperation].self, from: data) else {
            return
        }
        queue = loaded
    }

    private func save() {
        guard let data = try? encoder.encode(queue) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }

    enum OfflineQueueError: Error {
        case queueFull
    }
}
```

**File: `apps/ios/Sources/Services/NetworkMonitor.swift`** — New iOS network monitor:

```swift
import Network

@Observable
final class NetworkMonitor {
    private(set) var isOnline = true
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "llamenos.network-monitor")

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isOnline = path.status == .satisfied
            }
        }
        monitor.start(queue: queue)
    }

    func stop() {
        monitor.cancel()
    }
}
```

**File: `apps/ios/Sources/Views/Components/OfflineBanner.swift`**:

```swift
struct OfflineBanner: View {
    let queueCount: Int

    var body: some View {
        HStack {
            Image(systemName: "wifi.slash")
            Text("common_offline")
            if queueCount > 0 {
                Text("offline_queue_count \(queueCount)")
                    .font(.caption)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(.red.opacity(0.9))
        .foregroundStyle(.white)
        .font(.subheadline.weight(.medium))
    }
}
```

### 4. Android: Room Database Queue

**File: `apps/android/app/src/main/java/org/llamenos/hotline/service/OfflineQueue.kt`**:

```kotlin
@Entity(tableName = "offline_queue")
data class QueuedOperationEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val type: String,
    val method: String,
    val path: String,
    val body: String,
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0,
    val maxRetries: Int = 5,
)

@Dao
interface OfflineQueueDao {
    @Query("SELECT * FROM offline_queue ORDER BY createdAt ASC")
    suspend fun getAll(): List<QueuedOperationEntity>

    @Query("SELECT COUNT(*) FROM offline_queue")
    fun count(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(operation: QueuedOperationEntity)

    @Delete
    suspend fun delete(operation: QueuedOperationEntity)

    @Query("DELETE FROM offline_queue")
    suspend fun deleteAll()

    @Update
    suspend fun update(operation: QueuedOperationEntity)
}
```

**File: `apps/android/app/src/main/java/org/llamenos/hotline/service/OfflineQueueManager.kt`**:

```kotlin
@Singleton
class OfflineQueueManager @Inject constructor(
    private val dao: OfflineQueueDao,
    private val apiService: ApiService,
    private val networkMonitor: NetworkMonitor,
) {
    val queueCount: Flow<Int> = dao.count()

    private val _replayResult = MutableSharedFlow<ReplayResult>()
    val replayResult: SharedFlow<ReplayResult> = _replayResult.asSharedFlow()

    private var isReplaying = false

    suspend fun enqueue(
        type: String,
        method: String,
        path: String,
        body: String,
    ) {
        val count = dao.getAll().size
        if (count >= MAX_QUEUE_SIZE) {
            throw IllegalStateException("Offline queue full")
        }
        dao.insert(QueuedOperationEntity(
            type = type,
            method = method,
            path = path,
            body = body,
        ))
    }

    suspend fun replay() {
        if (isReplaying) return
        isReplaying = true

        val operations = dao.getAll()
        var succeeded = 0
        var failed = 0

        for (op in operations) {
            try {
                val statusCode = apiService.rawRequest(op.method, op.path, op.body)
                when {
                    statusCode in 200..299 || statusCode == 409 -> {
                        dao.delete(op)
                        succeeded++
                    }
                    statusCode >= 500 -> {
                        val updated = op.copy(retryCount = op.retryCount + 1)
                        if (updated.retryCount >= updated.maxRetries) {
                            dao.delete(op)
                            failed++
                        } else {
                            dao.update(updated)
                        }
                    }
                    else -> {
                        dao.delete(op)
                        failed++
                    }
                }
            } catch (_: Exception) {
                // Network still down — stop replay
                break
            }
        }

        isReplaying = false
        _replayResult.emit(ReplayResult(succeeded, failed))
    }

    /** Start auto-replay when network comes back */
    fun observeConnectivity(scope: CoroutineScope) {
        scope.launch {
            networkMonitor.isOnline.collect { online ->
                if (online && dao.getAll().isNotEmpty()) {
                    replay()
                }
            }
        }
    }

    data class ReplayResult(val succeeded: Int, val failed: Int)

    companion object {
        private const val MAX_QUEUE_SIZE = 100
    }
}
```

**File: `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/OfflineBanner.kt`** — Already exists, enhance with queue count:

```kotlin
// Add queueCount parameter to existing OfflineBanner composable
@Composable
fun OfflineBanner(queueCount: Int = 0) {
    // Existing offline UI + queue count indicator
}
```

### 5. Nostr Relay Reconnection & Event Replay

**File: `src/client/lib/nostr/relay.ts`** — Add event replay on reconnect:

```typescript
// Track last seen event timestamp
let lastSeenTimestamp = 0

function onNostrEvent(event: NostrEvent) {
  lastSeenTimestamp = Math.max(lastSeenTimestamp, event.created_at)
  // ... existing event handling
}

function onReconnect() {
  // Request events since last seen timestamp (with a small overlap buffer)
  const since = lastSeenTimestamp > 0 ? lastSeenTimestamp - 5 : undefined
  if (since) {
    // Send REQ with since filter to catch missed events
    sendSubscription({
      filter: {
        since,
        '#t': ['llamenos:event'],
      }
    })
  }
}
```

**File: `apps/ios/Sources/Services/WebSocketService.swift`** — Add same replay logic:

```swift
private var lastSeenTimestamp: TimeInterval = 0

func onReconnect() {
    guard lastSeenTimestamp > 0 else { return }
    let since = lastSeenTimestamp - 5 // 5 second overlap buffer
    sendSubscription(since: since, tags: [["t", "llamenos:event"]])
}
```

**File: `apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt`** — Same pattern.

### 6. i18n Strings

Add to `packages/i18n/locales/en.json`:

```json
{
  "offline": {
    "queue_count": "{{count}} operation(s) queued",
    "sync_success": "Synced {{count}} queued operation(s)",
    "sync_failed": "{{count}} operation(s) failed to sync",
    "queue_full": "Offline queue full — please reconnect to sync",
    "conflict": "A sync conflict occurred — the server version was kept"
  }
}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/client/lib/offline-queue.ts` | **New** — Desktop offline queue (Tauri Store) |
| `src/client/lib/api.ts` | Integrate queue on network errors for write operations |
| `src/client/components/offline-banner.tsx` | Add queue count display |
| `src/client/routes/__root.tsx` | Wire reconnect replay and sync notifications |
| `src/client/lib/nostr/relay.ts` | Add last-seen timestamp tracking and replay-on-reconnect |
| `apps/ios/Sources/Services/OfflineQueue.swift` | **New** — iOS offline queue (UserDefaults) |
| `apps/ios/Sources/Services/NetworkMonitor.swift` | **New** — iOS network connectivity monitor |
| `apps/ios/Sources/Views/Components/OfflineBanner.swift` | **New** — iOS offline banner |
| `apps/ios/Sources/Services/WebSocketService.swift` | Add event replay on reconnect |
| `apps/ios/Sources/App/LlamenosApp.swift` | Wire network monitor and offline queue |
| `apps/android/app/src/main/java/org/llamenos/hotline/service/OfflineQueue.kt` | **New** — Room entity and DAO |
| `apps/android/app/src/main/java/org/llamenos/hotline/service/OfflineQueueManager.kt` | **New** — Queue manager with replay |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/OfflineBanner.kt` | Add queue count parameter |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/WebSocketService.kt` | Add event replay on reconnect |
| `apps/android/app/src/main/java/org/llamenos/hotline/di/AppModule.kt` | Provide `OfflineQueueDao` |
| `packages/i18n/locales/en.json` | Add `offline.*` strings |
| `packages/i18n/locales/*.json` | Propagate to all locales |
| `tests/mocks/tauri-core.ts` | Mock offline queue store for Playwright |

## Testing

### Desktop (Playwright)

- **Queue test**: Simulate offline (mock `navigator.onLine = false`), attempt note creation — verify operation is queued and "1 operation queued" appears in banner.
- **Replay test**: Queue operations while offline, simulate going online — verify operations are replayed and success toast appears.
- **Queue persistence test**: Queue an operation, reload the page, verify the queue persists.
- **Queue full test**: Queue 100 operations, attempt 101st — verify error message.

### iOS (XCTest)

- **Unit test**: `OfflineQueueTests` — enqueue, verify count, replay with mock API, verify dequeued.
- **Unit test**: `NetworkMonitorTests` — verify `isOnline` state changes.
- **UI test**: Inject offline state — verify banner appears with queue count.

### Android (Unit + UI)

- **Unit test**: `OfflineQueueManagerTest` — enqueue, replay with mock API, verify DAO interactions.
- **Unit test**: Room DAO test — insert, query, delete, count.
- **UI test**: Inject offline state and queue count — verify `OfflineBanner` shows count.

### Nostr Replay

- **Desktop E2E**: Disconnect WebSocket, send events via simulation API, reconnect — verify missed events are received via replay subscription.

## Acceptance Criteria

- [ ] Write operations (note create/edit, message send, shift toggle) are queued when offline on all platforms
- [ ] Queue persists across app restarts (Tauri Store, UserDefaults, Room database)
- [ ] Operations replay automatically in FIFO order when connectivity returns
- [ ] Failed replays retry with exponential backoff up to `maxRetries`
- [ ] Conflict resolution: server wins on 409, client notified
- [ ] Offline banner with queue count visible on all three platforms
- [ ] iOS has a `NetworkMonitor` using `NWPathMonitor`
- [ ] Nostr relay reconnection replays events since last-seen timestamp
- [ ] Queue has a maximum size (100 operations) with clear error when full
- [ ] Sync results (succeeded/failed counts) shown to user after replay
- [ ] i18n strings added for offline/queue messaging in all 13 locales
- [ ] All platform tests pass

## Risk Assessment

- **Auth token expiry**: Auth tokens generated at queue time may expire before replay. Mitigation: replay must regenerate auth headers at replay time using the current crypto state, NOT replay the stale headers stored in the queue entry. The `headers` field in `QueuedOperation` should be treated as a template (preserving non-auth headers like Content-Type), and auth headers must be freshly generated during replay. If the crypto state is locked, prompt the user to re-enter PIN before replay.
- **Stale data**: A note queued for creation while offline may reference a call that has since ended. The server should accept the note anyway (backfill is valid for crisis documentation).
- **Queue ordering**: Operations must replay in strict order — a note edit must not replay before the note creation. The FIFO queue handles this naturally.
- **Storage limits**: 100 operations is generous for typical usage. If a volunteer goes offline for hours during a busy shift, they might queue many notes. The 100 limit prevents unbounded storage growth.
- **Nostr replay**: The `since` filter may return a large number of events if the disconnect was long. Rate-limit event processing on reconnect to avoid UI jank.
