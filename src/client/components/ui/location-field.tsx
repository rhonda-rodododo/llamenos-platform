import { useState, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MapPin, ExternalLink } from 'lucide-react'
import type { LocationResult } from '@protocol/schemas/geocoding'
import { getApiUrl } from '@/lib/api-config'
import { netFetch } from '@/lib/net'

type LocationPrecision = 'none' | 'city' | 'neighborhood' | 'block' | 'exact'

export interface LocationFieldValue {
  address: string
  displayName?: string
  lat?: number
  lon?: number
}

interface LocationFieldProps {
  value: LocationFieldValue | null
  onChange: (value: LocationFieldValue | null) => void
  maxPrecision?: LocationPrecision
  allowAutocomplete?: boolean
  placeholder?: string
  disabled?: boolean
}

const PRECISION_RANK: Record<LocationPrecision, number> = {
  none: 0, city: 1, neighborhood: 2, block: 3, exact: 4,
}

function capToPrecision(result: LocationResult, maxPrecision: LocationPrecision): LocationFieldValue {
  const rank = PRECISION_RANK[maxPrecision]
  return {
    address: result.address,
    displayName: rank >= PRECISION_RANK.exact ? result.displayName : undefined,
    lat: rank >= PRECISION_RANK.block ? result.lat : undefined,
    lon: rank >= PRECISION_RANK.block ? result.lon : undefined,
  }
}

function openInMaps(value: LocationFieldValue) {
  const label = encodeURIComponent(value.address)
  if (value.lat != null && value.lon != null) {
    window.open(
      `https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lon}&zoom=15`,
      '_blank',
      'noopener,noreferrer',
    )
  } else {
    window.open(
      `https://www.openstreetmap.org/search?query=${label}`,
      '_blank',
      'noopener,noreferrer',
    )
  }
}

export function LocationField({
  value,
  onChange,
  maxPrecision = 'exact',
  allowAutocomplete = true,
  placeholder = 'Search for an address…',
  disabled = false,
}: LocationFieldProps) {
  const [query, setQuery] = useState(value?.address ?? '')
  const [suggestions, setSuggestions] = useState<LocationResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 3) { setSuggestions([]); return }
    setLoading(true)
    try {
      const res = await netFetch(getApiUrl('/geocoding/autocomplete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 5 }),
        credentials: 'include',
      })
      if (res.ok) setSuggestions(await res.json() as LocationResult[])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (!allowAutocomplete) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 300)
  }

  function selectSuggestion(result: LocationResult) {
    setSuggestions([])
    setQuery(result.address)
    onChange(capToPrecision(result, maxPrecision))
  }

  function clearValue() {
    setQuery('')
    setSuggestions([])
    onChange(null)
  }

  return (
    <div className="relative space-y-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={handleInputChange}
            placeholder={placeholder}
            disabled={disabled}
            className="pr-8"
          />
          {loading && (
            <span className="absolute right-2 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          )}
        </div>
        {value && (
          <Button variant="ghost" size="icon" onClick={() => openInMaps(value)} title="Open in maps">
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        {value && !disabled && (
          <Button variant="ghost" size="icon" onClick={clearValue} title="Clear">
            ×
          </Button>
        )}
      </div>

      {suggestions.length > 0 && (
        <ul className="absolute z-50 w-full rounded-md border bg-popover shadow-md">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => selectSuggestion(s)}
              >
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                {s.address}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value && !suggestions.length && (
        <p className="text-xs text-muted-foreground">
          {value.address}
          {value.lat != null && value.lon != null && ` (${value.lat.toFixed(4)}, ${value.lon.toFixed(4)})`}
        </p>
      )}
    </div>
  )
}
