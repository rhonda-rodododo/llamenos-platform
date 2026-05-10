import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Phone, Plus, RefreshCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/toast'
import { listPhoneNumbers, searchPhoneNumbers, provisionPhoneNumber } from '@/lib/api/provider-setup'
import type { OwnedNumber, AvailableNumber } from '@protocol/schemas/provider-setup'
import type { TelephonyProviderType } from '@shared/types'

interface PhoneNumberSelectorProps {
  provider: string
  hubId?: string
  selectedNumber: string
  onSelect: (phoneNumber: string) => void
  credentialsValid: boolean
}

type TabType = 'existing' | 'search'

export function PhoneNumberSelector({
  provider,
  hubId,
  selectedNumber,
  onSelect,
  credentialsValid,
}: PhoneNumberSelectorProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [tab, setTab] = useState<TabType>('existing')
  const [existingNumbers, setExistingNumbers] = useState<OwnedNumber[]>([])
  const [searchResults, setSearchResults] = useState<AvailableNumber[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [provisioning, setProvisioning] = useState<string | null>(null)
  const [searchCountry, setSearchCountry] = useState('US')
  const [searchAreaCode, setSearchAreaCode] = useState('')
  const [manualNumber, setManualNumber] = useState(selectedNumber)
  const [hasLoaded, setHasLoaded] = useState(false)

  const fetchExistingNumbers = useCallback(async () => {
    if (!credentialsValid) return
    setLoading(true)
    try {
      const result = await listPhoneNumbers(provider, hubId)
      setExistingNumbers(result.numbers)
      setHasLoaded(true)
    } catch {
      setHasLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [provider, hubId, credentialsValid])

  useEffect(() => {
    if (credentialsValid && !hasLoaded) {
      fetchExistingNumbers()
    }
  }, [credentialsValid, hasLoaded, fetchExistingNumbers])

  async function handleSearch() {
    setSearching(true)
    try {
      const result = await searchPhoneNumbers({
        providerType: provider as TelephonyProviderType,
        countryCode: searchCountry,
        areaCode: searchAreaCode || undefined,
        limit: 20,
      })
      setSearchResults(result.numbers)
    } catch {
      toast(t('setup.phoneNumbers.searchFailed', { defaultValue: 'Search failed' }), 'error')
    } finally {
      setSearching(false)
    }
  }

  async function handleProvision(phoneNumber: string) {
    setProvisioning(phoneNumber)
    try {
      await provisionPhoneNumber({
        phoneNumber,
        providerType: provider as TelephonyProviderType,
        hubId,
        autoConfigureWebhooks: true,
      })
      toast(t('setup.phoneNumbers.provisioned', { defaultValue: 'Number provisioned' }), 'success')
      onSelect(phoneNumber)
      await fetchExistingNumbers()
      setTab('existing')
    } catch (err) {
      toast(
        err instanceof Error ? err.message : t('setup.phoneNumbers.provisionFailed', { defaultValue: 'Provision failed' }),
        'error',
      )
    } finally {
      setProvisioning(null)
    }
  }

  if (!credentialsValid) {
    return (
      <div className="space-y-3">
        <Label>{t('telephonyProvider.phoneNumber')}</Label>
        <Input
          value={manualNumber}
          onChange={(e) => {
            setManualNumber(e.target.value)
            onSelect(e.target.value)
          }}
          placeholder="+12125551234"
          data-testid="phone-number-input"
        />
        <p className="text-xs text-muted-foreground">
          {t('setup.phoneNumbers.validateFirst', { defaultValue: 'Validate provider credentials first' })}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="phone-number-selector">
      <div className="flex items-center justify-between">
        <Label>{t('telephonyProvider.phoneNumber')}</Label>
        <div className="flex gap-1">
          <Button
            variant={tab === 'existing' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('existing')}
            className="text-xs h-7 px-2"
            data-testid="tab-existing"
          >
            <Phone className="h-3 w-3" />
            {t('setup.phoneNumbers.existing', { defaultValue: 'Your Numbers' })}
          </Button>
          <Button
            variant={tab === 'search' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('search')}
            className="text-xs h-7 px-2"
            data-testid="tab-search"
          >
            <Search className="h-3 w-3" />
            {t('setup.phoneNumbers.buyNew', { defaultValue: 'Get a New Number' })}
          </Button>
        </div>
      </div>

      {tab === 'existing' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={manualNumber}
              onChange={(e) => {
                setManualNumber(e.target.value)
                onSelect(e.target.value)
              }}
              placeholder="+12125551234"
              className="flex-1"
              data-testid="phone-number-input"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={fetchExistingNumbers}
              disabled={loading}
              aria-label={t('setup.phoneNumbers.refresh', { defaultValue: 'Refresh' })}
              data-testid="refresh-numbers-btn"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          {existingNumbers.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
              {existingNumbers.map((num) => (
                <button
                  key={num.id}
                  type="button"
                  onClick={() => {
                    onSelect(num.phoneNumber)
                    setManualNumber(num.phoneNumber)
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors ${
                    selectedNumber === num.phoneNumber ? 'bg-primary/5' : ''
                  }`}
                  data-testid={`phone-number-option-${num.phoneNumber}`}
                >
                  <div>
                    <p className="text-sm font-medium">{num.phoneNumber}</p>
                    {num.friendlyName && <p className="text-xs text-muted-foreground">{num.friendlyName}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {num.capabilities.includes('voice') && (
                      <Badge variant="outline" className="text-[10px]">
                        {t('setup.phoneNumbers.voice', { defaultValue: 'Voice' })}
                      </Badge>
                    )}
                    {num.capabilities.includes('sms') && (
                      <Badge variant="outline" className="text-[10px]">
                        {t('setup.phoneNumbers.sms', { defaultValue: 'SMS' })}
                      </Badge>
                    )}
                    {selectedNumber === num.phoneNumber && <Check className="h-4 w-4 text-primary" />}
                  </div>
                </button>
              ))}
            </div>
          )}

          {hasLoaded && existingNumbers.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground">
              {t('setup.phoneNumbers.noExisting', { defaultValue: 'No existing numbers found' })}
            </p>
          )}
        </div>
      )}

      {tab === 'search' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="space-y-1 flex-1">
              <Input
                value={searchCountry}
                onChange={(e) => setSearchCountry(e.target.value.toUpperCase())}
                placeholder="US"
                maxLength={2}
                data-testid="search-country"
              />
              <p className="text-[10px] text-muted-foreground">
                {t('setup.phoneNumbers.countryCode', { defaultValue: 'Country' })}
              </p>
            </div>
            <div className="space-y-1 flex-1">
              <Input
                value={searchAreaCode}
                onChange={(e) => setSearchAreaCode(e.target.value)}
                placeholder="212"
                maxLength={5}
                data-testid="search-area-code"
              />
              <p className="text-[10px] text-muted-foreground">
                {t('setup.phoneNumbers.areaCode', { defaultValue: 'Area Code' })}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleSearch}
              disabled={searching || !searchCountry}
              className="self-start"
              data-testid="search-numbers-btn"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {t('setup.phoneNumbers.search', { defaultValue: 'Search' })}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
              {searchResults.map((num) => (
                <div key={num.phoneNumber} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{num.phoneNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {[num.locality, num.region].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleProvision(num.phoneNumber)}
                    disabled={provisioning === num.phoneNumber}
                    data-testid={`provision-${num.phoneNumber}`}
                  >
                    {provisioning === num.phoneNumber ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    {t('setup.phoneNumbers.provision', { defaultValue: 'Get' })}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
