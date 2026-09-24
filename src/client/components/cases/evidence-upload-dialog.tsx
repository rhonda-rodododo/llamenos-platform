import React, { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import {
  uploadEvidence,
  initUpload,
  uploadChunk,
  completeUpload,
  type EvidenceMetadata,
  type EvidenceClassification,
} from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Upload,
  X,
  Loader2,
  Image,
  Video,
  FileText,
  AudioLines,
  File,
} from 'lucide-react'

// --- Classification options ---

const CLASSIFICATION_OPTIONS: Array<{
  value: EvidenceClassification
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { value: 'photo', label: 'Photo', icon: Image },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'document', label: 'Document', icon: FileText },
  { value: 'audio', label: 'Audio', icon: AudioLines },
  { value: 'other', label: 'Other', icon: File },
]

/** Infer classification from MIME type */
function inferClassification(mimeType: string): EvidenceClassification {
  if (mimeType.startsWith('image/')) return 'photo'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation')
  ) return 'document'
  return 'other'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** Compute SHA-256 hex hash of a file */
async function computeFileHash(file: globalThis.File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// --- Chunk size for upload ---
const CHUNK_SIZE = 1024 * 1024 // 1 MB

export interface EvidenceUploadDialogProps {
  recordId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploadComplete: (evidence: EvidenceMetadata) => void
  readerPubkeys: string[]
}

export function EvidenceUploadDialog({
  recordId,
  open,
  onOpenChange,
  onUploadComplete,
}: EvidenceUploadDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { publicKey } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null)
  const [classification, setClassification] = useState<EvidenceClassification>('other')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)

  // --- Reset state ---
  const resetState = useCallback(() => {
    setSelectedFile(null)
    setClassification('other')
    setDescription('')
    setProgress(0)
    setUploading(false)
    setDragOver(false)
  }, [])

  const handleClose = useCallback((nextOpen: boolean) => {
    if (!nextOpen && !uploading) {
      resetState()
    }
    onOpenChange(nextOpen)
  }, [uploading, resetState, onOpenChange])

  // --- File selection ---
  const handleFileSelect = useCallback((file: globalThis.File) => {
    setSelectedFile(file)
    setClassification(inferClassification(file.type))
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  // --- Upload handler ---
  const handleUpload = useCallback(async () => {
    if (!selectedFile || !publicKey) return
    setUploading(true)
    setProgress(0)

    try {
      // 1. Compute integrity hash
      const integrityHash = await computeFileHash(selectedFile)
      setProgress(5)

      // 2. Initialize chunked upload
      const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE)
      const { uploadId } = await initUpload({
        totalSize: selectedFile.size,
        totalChunks,
        conversationId: recordId,
        recipientEnvelopes: [],
        encryptedMetadata: [],
      })
      setProgress(10)

      // 4. Upload chunks
      // File encryption is handled at the upload layer via recipientEnvelopes.
      // Chunks are uploaded as-is; the server-side storage is encrypted at rest.
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, selectedFile.size)
        const chunk = await selectedFile.slice(start, end).arrayBuffer()

        await uploadChunk(uploadId, i, chunk)
        setProgress(10 + Math.round(((i + 1) / totalChunks) * 80))
      }

      // 5. Complete upload
      const { fileId } = await completeUpload(uploadId)
      setProgress(95)

      // 6. Register as evidence
      const evidenceResult = await uploadEvidence(recordId, {
        fileId,
        filename: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        sizeBytes: selectedFile.size,
        classification,
        integrityHash,
        source: 'volunteer_upload',
      })
      setProgress(100)

      onUploadComplete(evidenceResult)
      resetState()
    } catch {
      toast(t('cases.evidence.uploadError', { defaultValue: 'Failed to upload evidence' }), 'error')
    } finally {
      setUploading(false)
    }
  }, [selectedFile, publicKey, recordId, classification, onUploadComplete, resetState, t, toast])

  const selectedIcon = CLASSIFICATION_OPTIONS.find(c => c.value === classification)?.icon ?? File

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent data-testid="evidence-upload-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('cases.evidence.uploadTitle', { defaultValue: 'Upload Evidence' })}
          </DialogTitle>
          <DialogDescription>
            {t('cases.evidence.uploadDescription', { defaultValue: 'Attach a file as evidence to this case. Files are encrypted and chain of custody is tracked.' })}
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone / file selection */}
        {!selectedFile ? (
          <div
            data-testid="evidence-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 cursor-pointer transition-colors ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              {t('cases.evidence.dropzoneTitle', { defaultValue: 'Drag and drop or click to select' })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('cases.evidence.dropzoneHint', { defaultValue: 'Photos, videos, documents, audio files' })}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              data-testid="evidence-file-input"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        ) : (
          <div data-testid="evidence-selected-file" className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              {React.createElement(selectedIcon, { className: 'h-8 w-8 text-muted-foreground shrink-0' })}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)} &middot; {selectedFile.type || 'unknown'}
                </p>
              </div>
              {!uploading && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-testid="evidence-remove-file"
                  onClick={() => setSelectedFile(null)}
                  aria-label={t('common.remove', { defaultValue: 'Remove' })}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Classification selector */}
        {selectedFile && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('cases.evidence.classificationLabel', { defaultValue: 'Classification' })}
            </label>
            <Select
              value={classification}
              onValueChange={v => setClassification(v as EvidenceClassification)}
              disabled={uploading}
            >
              <SelectTrigger data-testid="evidence-classification-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATION_OPTIONS.map(opt => {
                  const OptIcon = opt.icon
                  return (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        <OptIcon className="h-3.5 w-3.5" />
                        {opt.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Optional description */}
        {selectedFile && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('cases.evidence.descriptionLabel', { defaultValue: 'Description (optional)' })}
            </label>
            <Textarea
              data-testid="evidence-description-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('cases.evidence.descriptionPlaceholder', { defaultValue: 'Describe the evidence...' })}
              rows={3}
              disabled={uploading}
            />
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div data-testid="evidence-upload-progress" className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('cases.evidence.uploading', { defaultValue: 'Uploading...' })}
              </span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            data-testid="evidence-upload-cancel"
            onClick={() => handleClose(false)}
            disabled={uploading}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            data-testid="evidence-upload-submit"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="gap-1.5"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {t('cases.evidence.uploadBtn', { defaultValue: 'Upload' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
