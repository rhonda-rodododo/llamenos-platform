import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import {
  getAssignmentSuggestions,
  assignRecord,
  type AssignmentSuggestion,
} from '@/lib/api'
import { useToast } from '@/lib/toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, UserPlus, Star, Users, Globe, BookOpen } from 'lucide-react'

interface AssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string
  onAssigned: (pubkeys: string[]) => void
}

export function AssignmentDialog({
  open,
  onOpenChange,
  recordId,
  onAssigned,
}: AssignmentDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [suggestions, setSuggestions] = useState<AssignmentSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)

  // Fetch suggestions when dialog opens
  useEffect(() => {
    if (!open || !recordId) return
    setLoading(true)
    getAssignmentSuggestions(recordId)
      .then(({ suggestions: s }) => setSuggestions(s))
      .catch(() => {
        toast(t('cases.suggestError', { defaultValue: 'Failed to load suggestions' }), 'error')
      })
      .finally(() => setLoading(false))
  }, [open, recordId, t, toast])

  const handleAssign = useCallback(async (pubkey: string) => {
    setAssigning(pubkey)
    try {
      await assignRecord(recordId, [pubkey])
      toast(t('cases.assigned', { defaultValue: 'Volunteer assigned' }), 'success')
      onAssigned([pubkey])
      onOpenChange(false)
    } catch {
      toast(t('cases.assignError', { defaultValue: 'Failed to assign' }), 'error')
    } finally {
      setAssigning(null)
    }
  }, [recordId, toast, t, onAssigned, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="assignment-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('cases.assignTitle', { defaultValue: 'Assign Volunteer' })}
          </DialogTitle>
          <DialogDescription>
            {t('cases.assignDescription', { defaultValue: 'Select a volunteer based on availability, workload, and skills.' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : suggestions.length === 0 ? (
            <div data-testid="no-suggestions" className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">
                {t('cases.noSuggestions', { defaultValue: 'No available volunteers found' })}
              </p>
              <p className="text-xs mt-1">
                {t('cases.noSuggestionsHint', { defaultValue: 'Make sure volunteers are on-shift and have capacity.' })}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground px-1">
                {t('cases.suggestedVolunteers', { defaultValue: 'Suggested volunteers' })}
              </p>
              {suggestions.map(s => (
                <div
                  key={s.pubkey}
                  data-testid="suggestion-card"
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-mono text-primary shrink-0">
                    {s.pubkey.slice(0, 4)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate font-mono">
                        {s.pubkey.slice(0, 12)}...
                      </span>
                      <Badge variant="secondary" className="text-[10px] gap-0.5 shrink-0">
                        <Star className="h-2.5 w-2.5" />
                        {s.score}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span
                        data-testid="workload-indicator"
                        className="flex items-center gap-1 text-[10px] text-muted-foreground"
                        title={t('assignment.workloadLabel', { defaultValue: 'Workload score' })}
                      >
                        <Users className="h-2.5 w-2.5" />
                        {s.activeCaseCount}/{s.maxCases}
                      </span>
                      {(s.specializationScore ?? 0) > 0 && (
                        <Badge
                          data-testid="specialization-score"
                          variant="outline"
                          className="text-[10px]"
                          title={t('assignment.specializationLabel', { defaultValue: 'Specialization match' })}
                        >
                          <BookOpen className="h-2.5 w-2.5 mr-0.5" />
                          {s.specializationScore}/25 spec
                        </Badge>
                      )}
                      {(s.languageScore ?? 0) > 0 && (
                        <Badge data-testid="language-match" variant="outline" className="text-[10px]">
                          <Globe className="h-2.5 w-2.5 mr-0.5" />
                          {t('assignment.languageMatch', { defaultValue: 'Language match' })}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="assign-volunteer-btn"
                    disabled={assigning === s.pubkey}
                    onClick={() => handleAssign(s.pubkey)}
                  >
                    {assigning === s.pubkey ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
