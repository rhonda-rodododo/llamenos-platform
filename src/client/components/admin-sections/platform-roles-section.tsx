import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  addRoleEnvelopes,
  getPermissionsCatalog,
  type RoleDefinition,
} from '@/lib/api'
import { hpkeSeal, hpkeOpenFromState, getDevicePubkeys, type HpkeEnvelope } from '@/lib/platform'
import { SectionBody, SectionDescription } from '@/components/admin-shell/section-layout'
import { RoleList } from '@/components/admin-settings/role-list'
import { RoleEditor, type RoleFormData } from '@/components/admin-settings/role-editor'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { bytesToHex } from '@noble/hashes/utils.js'
import { LABEL_PLATFORM_ROLE_NAME_ENCRYPT, LABEL_PLATFORM_ROLE_DESC_ENCRYPT } from '@shared/crypto-labels'

const LABEL_NAME = LABEL_PLATFORM_ROLE_NAME_ENCRYPT
const LABEL_DESC = LABEL_PLATFORM_ROLE_DESC_ENCRYPT

function textToHex(text: string): string {
  return bytesToHex(new TextEncoder().encode(text))
}

function hexToText(hex: string): string {
  const pairs = hex.match(/.{2}/g) ?? []
  const bytes = new Uint8Array(pairs.map(b => parseInt(b, 16)))
  return new TextDecoder().decode(bytes)
}

interface DecryptedRole extends RoleDefinition {
  decryptedName?: string
  decryptedDescription?: string
}

export function PlatformRolesSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission, adminDecryptionPubkey } = useAuth()
  const canManageRoles = hasPermission('system:manage-roles')

  const [roles, setRoles] = useState<DecryptedRole[]>([])
  const [catalog, setCatalog] = useState<Record<string, { key: string; label: string }[]> | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RoleDefinition | null>(null)

  const decryptRoles = useCallback(async (rawRoles: RoleDefinition[]): Promise<DecryptedRole[]> => {
    const deviceState = await getDevicePubkeys()
    if (!deviceState) return rawRoles

    const myEncPubkey = deviceState.encryptionPubkeyHex

    return Promise.all(rawRoles.map(async (role) => {
      if (role.isSystem && role.name) {
        return { ...role, decryptedName: role.name, decryptedDescription: role.description }
      }

      const myEnvelope = role.envelopes?.find(e => e.adminPubkey === myEncPubkey)
      if (!myEnvelope) {
        return { ...role, decryptedName: role.slug, decryptedDescription: '' }
      }

      try {
        const nameEnvelope: HpkeEnvelope = JSON.parse(myEnvelope.encryptedName)
        const descEnvelope: HpkeEnvelope = JSON.parse(myEnvelope.encryptedDescription)

        const nameHex = await hpkeOpenFromState(nameEnvelope, LABEL_NAME, textToHex(`${role.id}:name`))
        const descHex = await hpkeOpenFromState(descEnvelope, LABEL_DESC, textToHex(`${role.id}:description`))

        return {
          ...role,
          decryptedName: hexToText(nameHex),
          decryptedDescription: hexToText(descHex),
        }
      } catch {
        return { ...role, decryptedName: role.slug, decryptedDescription: '' }
      }
    }))
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [rolesRes, catalogRes] = await Promise.all([
        listRoles(),
        canManageRoles ? getPermissionsCatalog() : Promise.resolve(null),
      ])
      const decrypted = await decryptRoles(rolesRes.roles)
      setRoles(decrypted)
      if (catalogRes) setCatalog(catalogRes.byDomain)
    } catch {
      toast(t('common.error', { defaultValue: 'Error' }), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast, canManageRoles, decryptRoles])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function sealForAdmin(
    name: string,
    description: string,
    roleId: string,
  ): Promise<{ adminPubkey: string; encryptedName: string; encryptedDescription: string }[]> {
    const deviceState = await getDevicePubkeys()
    if (!deviceState) throw new Error('Device keys not available')

    const myEncPubkey = deviceState.encryptionPubkeyHex
    const nameEnvelope = await hpkeSeal(
      textToHex(name),
      myEncPubkey,
      LABEL_NAME,
      textToHex(`${roleId}:name`),
    )
    const descEnvelope = await hpkeSeal(
      textToHex(description),
      myEncPubkey,
      LABEL_DESC,
      textToHex(`${roleId}:description`),
    )

    const envelopes = [
      {
        adminPubkey: myEncPubkey,
        encryptedName: JSON.stringify(nameEnvelope),
        encryptedDescription: JSON.stringify(descEnvelope),
      },
    ]

    // If there's a platform-wide admin decryption pubkey that differs from ours, seal for that too
    if (adminDecryptionPubkey && adminDecryptionPubkey !== myEncPubkey) {
      const adminNameEnvelope = await hpkeSeal(
        textToHex(name),
        adminDecryptionPubkey,
        LABEL_NAME,
        textToHex(`${roleId}:name`),
      )
      const adminDescEnvelope = await hpkeSeal(
        textToHex(description),
        adminDecryptionPubkey,
        LABEL_DESC,
        textToHex(`${roleId}:description`),
      )
      envelopes.push({
        adminPubkey: adminDecryptionPubkey,
        encryptedName: JSON.stringify(adminNameEnvelope),
        encryptedDescription: JSON.stringify(adminDescEnvelope),
      })
    }

    return envelopes
  }

  async function handleSave(form: RoleFormData) {
    setSaving(true)
    try {
      if (editingId === 'new') {
        const roleId = `role-${crypto.randomUUID()}`
        const envelopes = await sealForAdmin(form.name, form.description, roleId)

        const res = await createRole({
          id: roleId,
          slug: form.slug,
          permissions: form.permissions,
          description: '',
          envelopes,
        })
        const decrypted = await decryptRoles([res.role])
        setRoles(prev => [...prev, ...decrypted])
        toast(t('common.success', { defaultValue: 'Success' }), 'success')
      } else if (editingId) {
        await updateRole(editingId, {
          permissions: form.permissions,
        })

        // Re-seal envelopes with updated name/description
        const envelopes = await sealForAdmin(form.name, form.description, editingId)
        await addRoleEnvelopes(editingId, envelopes)

        // Refresh the list
        const rolesRes = await listRoles()
        const decrypted = await decryptRoles(rolesRes.roles)
        setRoles(decrypted)
        toast(t('common.success', { defaultValue: 'Success' }), 'success')
      }
      setEditingId(null)
    } catch {
      toast(t('common.error', { defaultValue: 'Error' }), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteRole(deleteTarget.id)
      setRoles(prev => prev.filter(r => r.id !== deleteTarget.id))
      toast(t('common.success', { defaultValue: 'Success' }), 'success')
      if (editingId === deleteTarget.id) setEditingId(null)
    } catch {
      toast(t('common.error', { defaultValue: 'Error' }), 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  function startEdit(role: DecryptedRole) {
    setEditingId(role.id)
  }

  function getInitialForm(role: DecryptedRole): RoleFormData {
    return {
      name: role.decryptedName ?? role.slug,
      slug: role.slug,
      description: role.decryptedDescription ?? '',
      permissions: [...role.permissions],
    }
  }

  if (loading) return null

  // Map roles to show decrypted names in the RoleList
  const displayRoles: RoleDefinition[] = roles.map(r => ({
    ...r,
    name: r.decryptedName ?? r.slug,
    description: r.decryptedDescription ?? r.description,
  }))

  const editingRole = editingId && editingId !== 'new'
    ? roles.find(r => r.id === editingId)
    : undefined

  return (
    <SectionBody>
      <SectionDescription>{t('platformRoles.description', { defaultValue: 'Manage platform-wide roles that apply across all hubs. Role names are end-to-end encrypted.' })}</SectionDescription>

      <RoleList
        roles={displayRoles}
        editingId={editingId}
        onEdit={startEdit}
        onDelete={setDeleteTarget}
      />

      {editingId !== null && catalog && (
        <RoleEditor
          initial={editingId === 'new' ? null : editingRole ? getInitialForm(editingRole) : null}
          catalog={catalog}
          saving={saving}
          onSave={handleSave}
          onCancel={() => setEditingId(null)}
          showSlug={editingId === 'new'}
        />
      )}

      {editingId === null && canManageRoles && (
        <Button
          variant="outline"
          data-testid="platform-role-create-btn"
          onClick={() => setEditingId('new')}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('roles.create', { defaultValue: 'Create role' })}
        </Button>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={t('roles.deleteTitle', { defaultValue: 'Delete role' })}
        description={t('roles.deleteConfirm.description', { defaultValue: 'This action cannot be undone. Users with this role will lose their permissions.' })}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </SectionBody>
  )
}
