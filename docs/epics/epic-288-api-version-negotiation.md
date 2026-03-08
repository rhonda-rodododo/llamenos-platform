# Epic 288: API Version Negotiation & Backwards Compatibility

**Status**: PENDING
**Priority**: High
**Depends on**: None
**Blocks**: Epic 289, Epic 290
**Branch**: `desktop`

## Summary

Introduce API version negotiation between all clients (Desktop, iOS, Android) and the server. Clients send their API version in an `X-API-Version` request header; the server responds with `X-Min-Version` and `X-Current-Version` headers. When a client's version falls below the server's minimum, the client shows a mandatory "Update Required" screen. Graceful degradation ensures old clients ignore new fields and the server provides defaults for removed fields during migration periods.

## Problem Statement

Today, all three clients call `/api/*` endpoints directly with no version negotiation. A single breaking API change (renamed field, removed endpoint, changed response shape) instantly breaks every deployed client. Volunteers on shift during a breaking deploy would lose the ability to answer calls, take notes, or manage shifts — a critical failure mode for a crisis hotline. There is no mechanism to warn users that their client is outdated, and no way for the server to maintain backwards compatibility during a rollout window.

## Implementation

### 1. Version Scheme

Use integer-based API versions starting at `1`. The version represents the wire format version, not the app version. Bump only when the request/response shape changes in a breaking way (removed fields, renamed fields, changed types). Additive changes (new optional fields) do not require a version bump.

```
API Version 1 — initial (current state, retroactively assigned)
```

### 2. Server-Side: Version Middleware

Create a Hono middleware that reads `X-API-Version` from the request, validates it, and sets `X-Min-Version` + `X-Current-Version` on every response. Store version config in `SettingsDO` so admins can adjust the minimum version (e.g., during a migration window).

**File: `apps/worker/middleware/api-version.ts`**

```typescript
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

export const API_CURRENT_VERSION = 1
export const API_MIN_VERSION = 1

export const apiVersion = createMiddleware<AppEnv>(async (c, next) => {
  const clientVersion = parseInt(c.req.header('X-API-Version') || '0', 10)

  // Store on context for route handlers to branch on
  c.set('clientApiVersion', clientVersion || API_CURRENT_VERSION)

  // If client sent a version below minimum, return 426 Upgrade Required BEFORE running the route handler.
  // Exception: /api/config is always accessible (needed to show update screen)
  if (clientVersion > 0 && clientVersion < API_MIN_VERSION) {
    const path = new URL(c.req.url).pathname
    if (!path.endsWith('/config') && !path.endsWith('/config/verify')) {
      return c.json({
        error: 'client_outdated',
        message: 'Your app version is no longer supported. Please update.',
        minVersion: API_MIN_VERSION,
        currentVersion: API_CURRENT_VERSION,
      }, 426)
    }
  }

  await next()

  // Always set version headers on responses
  c.header('X-Current-Version', String(API_CURRENT_VERSION))
  c.header('X-Min-Version', String(API_MIN_VERSION))
})
```

### 3. Server-Side: Version Registry

Add a version compatibility map that documents which versions support which features. This is informational for maintainers and used by route handlers to conditionally include/exclude fields.

**File: `apps/worker/lib/api-versions.ts`**

```typescript
export interface VersionCapabilities {
  supportsHubKey: boolean
  supportsMultiAdmin: boolean
  supportsConversationReassign: boolean
  supportsBlastMessages: boolean
  supportsDeviceLink: boolean
  // Add capabilities as versions evolve
}

const VERSION_CAPS: Record<number, VersionCapabilities> = {
  1: {
    supportsHubKey: true,
    supportsMultiAdmin: true,
    supportsConversationReassign: true,
    supportsBlastMessages: true,
    supportsDeviceLink: true,
  },
}

export function getCapabilities(version: number): VersionCapabilities {
  return VERSION_CAPS[version] ?? VERSION_CAPS[1]
}
```

### 4. Server-Side: Wire into App

**File: `apps/worker/app.ts`** — Add the middleware after CORS but before auth:

```typescript
import { apiVersion } from './middleware/api-version'

// After cors middleware, before auth
api.use('*', apiVersion)
```

**File: `apps/worker/types.ts`** — Extend `AppEnv` variables:

```typescript
// In the Variables type within AppEnv
clientApiVersion: number
```

### 5. Server-Side: `/api/config` Response Enhancement

Add version info to the public config endpoint so clients can check compatibility before authenticating.

**File: `apps/worker/routes/config.ts`** — Add to response:

```typescript
import { API_CURRENT_VERSION, API_MIN_VERSION } from '../middleware/api-version'

// Add to the config response object:
apiVersion: API_CURRENT_VERSION,
minApiVersion: API_MIN_VERSION,
```

### 6. Desktop Client: Send Version Header

**File: `src/client/lib/api.ts`** — Add `X-API-Version` header to every request:

```typescript
import { APP_API_VERSION } from './version'

// In getAuthHeaders() or in the request() function:
headers['X-API-Version'] = String(APP_API_VERSION)
```

**File: `src/client/lib/version.ts`** — Central version constant:

```typescript
/** API wire format version. Bump when request/response shapes change. */
export const APP_API_VERSION = 1
```

### 7. Desktop Client: Handle 426 and X-Min-Version

**File: `src/client/lib/api.ts`** — In the `request()` function, after receiving a response:

```typescript
// After fetch, check version headers
const minVersion = parseInt(res.headers.get('X-Min-Version') || '0', 10)
if (minVersion > APP_API_VERSION) {
  // Emit update-required event for the UI to catch
  window.dispatchEvent(new CustomEvent('llamenos:update-required', {
    detail: { minVersion, currentVersion: APP_API_VERSION }
  }))
}

if (res.status === 426) {
  throw new ApiVersionError('Client outdated — update required', minVersion)
}
```

**File: `src/client/components/update-required-screen.tsx`** — Full-screen blocking overlay:

```tsx
export function UpdateRequiredScreen() {
  // Listens for 'llamenos:update-required' event
  // Shows: "Your app is out of date. Please update to continue."
  // Desktop: "Check for Updates" button (triggers tray menu check-updates event)
  // Links to release page as fallback
}
```

### 8. iOS Client: Send Version Header

**File: `apps/ios/Sources/Services/APIService.swift`** — Add header to `authenticatedRequest()`:

```swift
private static let apiVersion = 1

// In the request building method:
request.setValue(String(Self.apiVersion), forHTTPHeaderField: "X-API-Version")
```

Add response header checking in the response handler:

```swift
if let minVersionStr = httpResponse.value(forHTTPHeaderField: "X-Min-Version"),
   let minVersion = Int(minVersionStr),
   minVersion > Self.apiVersion {
    await MainActor.run {
        NotificationCenter.default.post(name: .updateRequired, object: nil,
            userInfo: ["minVersion": minVersion])
    }
}

if httpResponse.statusCode == 426 {
    throw APIError.clientOutdated(minVersion: minVersion)
}
```

**File: `apps/ios/Sources/Views/UpdateRequiredView.swift`** — SwiftUI view shown when update is needed:

```swift
struct UpdateRequiredView: View {
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "arrow.down.app")
                .font(.system(size: 64))
            Text("update_required_title")
            Text("update_required_message")
            Link("update_required_button",
                 destination: URL(string: "https://apps.apple.com/app/id<APP_ID>")!)
        }
    }
}
```

### 9. Android Client: Send Version Header

**File: `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt`** — Add interceptor or header:

```kotlin
companion object {
    const val API_VERSION = 1
}

// In OkHttp interceptor chain or request builder:
request.newBuilder()
    .header("X-API-Version", API_VERSION.toString())
    .build()
```

**File: `apps/android/app/src/main/java/org/llamenos/hotline/api/VersionCheckInterceptor.kt`**:

```kotlin
class VersionCheckInterceptor @Inject constructor(
    private val updateRequiredFlow: MutableSharedFlow<Int>,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request().newBuilder()
            .header("X-API-Version", ApiService.API_VERSION.toString())
            .build()
        val response = chain.proceed(request)

        val minVersion = response.header("X-Min-Version")?.toIntOrNull() ?: 0
        if (minVersion > ApiService.API_VERSION) {
            updateRequiredFlow.tryEmit(minVersion)
        }
        return response
    }
}
```

### 10. Graceful Degradation Rules

- **New optional fields**: Server adds them freely. Old clients ignore unknown JSON keys (standard behavior for Kotlin `@Serializable(ignoreUnknownKeys=true)`, Swift `Codable`, and TypeScript).
- **Removed fields**: Server continues sending them with sensible defaults for `API_MIN_VERSION` through `API_CURRENT_VERSION`. After all clients update past the migration version, remove the field and bump `API_MIN_VERSION`.
- **Changed field types**: Never change types. Instead, add a new field with the new type, deprecate the old one, remove after migration window.
- **Removed endpoints**: Return 410 Gone with a JSON body pointing to the replacement endpoint. Remove after migration window.

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/middleware/api-version.ts` | **New** — Version negotiation middleware |
| `apps/worker/lib/api-versions.ts` | **New** — Version capability registry |
| `apps/worker/app.ts` | Wire `apiVersion` middleware into API chain |
| `apps/worker/types.ts` | Add `clientApiVersion` to `AppEnv` Variables |
| `apps/worker/routes/config.ts` | Add `apiVersion` and `minApiVersion` to response |
| `src/client/lib/version.ts` | **New** — Desktop API version constant |
| `src/client/lib/api.ts` | Send `X-API-Version` header, handle 426 |
| `src/client/components/update-required-screen.tsx` | **New** — Blocking update UI |
| `src/client/routes/__root.tsx` | Render `UpdateRequiredScreen` overlay |
| `apps/ios/Sources/Services/APIService.swift` | Send version header, check min version |
| `apps/ios/Sources/Views/UpdateRequiredView.swift` | **New** — SwiftUI update required view |
| `apps/ios/Sources/App/LlamenosApp.swift` | Show `UpdateRequiredView` when triggered |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/VersionCheckInterceptor.kt` | **New** — OkHttp interceptor for version check |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt` | Add API_VERSION constant |
| `apps/android/app/src/main/java/org/llamenos/hotline/di/AppModule.kt` | Wire interceptor |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/UpdateRequiredScreen.kt` | **New** — Compose update screen |
| `packages/i18n/locales/en.json` | Add `update_required_*` strings |

## Testing

### Desktop (Playwright)

- **Version header test**: Mock server returning `X-Min-Version: 999` — verify update-required screen appears and blocks navigation.
- **Normal operation test**: Verify `X-API-Version: 1` header is sent on every request.
- **426 response test**: Mock 426 response — verify graceful error handling, not a crash.
- **Config endpoint test**: Verify `/api/config` response includes `apiVersion` and `minApiVersion`.

### iOS (XCUITest)

- **Unit test**: `APIServiceTests` — verify version header is present on requests.
- **UI test**: Mock API returning 426 — verify `UpdateRequiredView` appears.

### Android (Unit + UI)

- **Unit test**: `VersionCheckInterceptorTest` — verify header injection and min-version extraction.
- **UI test**: Inject `updateRequiredFlow` emission — verify `UpdateRequiredScreen` composable renders.

### Worker (Integration)

- **Middleware test**: Request without `X-API-Version` header succeeds (defaults to current).
- **Middleware test**: Request with `X-API-Version: 0` succeeds (treated as unknown, defaults).
- **Middleware test**: Request with old version below `API_MIN_VERSION` to non-config endpoint returns 426.
- **Middleware test**: Request with old version to `/api/config` succeeds (exempt).
- **Response header test**: All responses include `X-Current-Version` and `X-Min-Version`.

## Acceptance Criteria

- [ ] All three clients send `X-API-Version` header on every API request
- [ ] Server responds with `X-Current-Version` and `X-Min-Version` on every API response
- [ ] `/api/config` response includes `apiVersion` and `minApiVersion` fields
- [ ] Client receiving `X-Min-Version` greater than its own version shows update-required screen
- [ ] Server returns HTTP 426 for outdated clients on all endpoints except `/api/config`
- [ ] `/api/config` is always accessible regardless of client version (needed to render update screen)
- [ ] Unknown JSON fields in API responses are silently ignored by all clients
- [ ] Version capability registry documents which versions support which features
- [ ] i18n strings added for update-required messaging in all 13 locales
- [ ] All platform tests pass

## Risk Assessment

- **Low risk**: This is purely additive — existing clients without the header are treated as current version.
- **Migration**: The middleware must be deployed before any client update that sends the header. Deploy server first, then roll out clients.
- **Edge case**: If the server's `API_MIN_VERSION` is bumped while a volunteer is on shift, they see the update screen mid-call. Mitigation: the update screen should not close active call connections — only block new navigation. Admins should coordinate version bumps with shift schedules.
- **Self-hosted deployments**: Operators who update the server but not clients will trigger the update screen. Documentation must clearly explain the version contract.
