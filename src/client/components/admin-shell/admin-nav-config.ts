import type { AdminNavConfig } from './admin-nav-config.types'

export const adminNavConfig: AdminNavConfig = {
  groups: [
    // This Hub
    {
      groupSlug: 'general',
      scope: 'this-hub',
      labelKey: 'adminNav.groups.general',
      items: [
        {
          slug: 'location-lookup',
          labelKey: 'adminNav.items.locationLookup',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-location-lookup',
        },
        {
          slug: 'passkey-policy',
          labelKey: 'adminNav.items.passkeyPolicy',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-passkey-policy',
        },
        {
          slug: 'recovery-group',
          labelKey: 'adminNav.items.recoveryGroup',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-recovery-group',
        },
        {
          slug: 'devices',
          labelKey: 'adminNav.items.devices',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-devices',
        },
      ],
    },
    {
      groupSlug: 'people',
      scope: 'this-hub',
      labelKey: 'adminNav.groups.people',
      items: [
        {
          slug: 'hub-roles',
          labelKey: 'adminNav.items.hubRoles',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-hub-roles',
        },
        {
          slug: 'teams',
          labelKey: 'adminNav.items.teams',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-teams',
        },
        {
          slug: 'tags',
          labelKey: 'adminNav.items.tags',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-tags',
        },
      ],
    },
    {
      groupSlug: 'intake',
      scope: 'this-hub',
      labelKey: 'adminNav.groups.intake',
      items: [
        {
          slug: 'custom-fields',
          labelKey: 'adminNav.items.customFields',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-custom-fields',
        },
        {
          slug: 'report-types',
          labelKey: 'adminNav.items.reportTypes',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-report-types',
        },
        {
          slug: 'firehose',
          labelKey: 'adminNav.items.firehose',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-firehose',
        },
      ],
    },
    {
      groupSlug: 'calls-voice',
      scope: 'this-hub',
      labelKey: 'adminNav.groups.callsVoice',
      items: [
        {
          slug: 'call-settings',
          labelKey: 'adminNav.items.callSettings',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-call-settings',
        },
        {
          slug: 'voice-prompts',
          labelKey: 'adminNav.items.voicePrompts',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-voice-prompts',
        },
        {
          slug: 'phone-menu-languages',
          labelKey: 'adminNav.items.phoneMenuLanguages',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-phone-menu-languages',
        },
        {
          slug: 'transcription',
          labelKey: 'adminNav.items.transcription',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-transcription',
        },
        {
          slug: 'spam-protection',
          labelKey: 'adminNav.items.spamProtection',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-spam-protection',
        },
      ],
    },
    {
      groupSlug: 'channels',
      scope: 'this-hub',
      labelKey: 'adminNav.groups.channels',
      items: [
        {
          slug: 'phone-provider',
          labelKey: 'adminNav.items.phoneProvider',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-phone-provider',
        },
        {
          slug: 'messaging-sms',
          labelKey: 'adminNav.items.messagingSms',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-messaging-sms',
        },
        {
          slug: 'rcs',
          labelKey: 'adminNav.items.rcs',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-rcs',
        },
        {
          slug: 'signal',
          labelKey: 'adminNav.items.signal',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-signal',
        },
      ],
    },
    {
      groupSlug: 'scheduling',
      scope: 'this-hub',
      labelKey: 'adminNav.groups.scheduling',
      items: [
        {
          slug: 'ring-groups',
          labelKey: 'adminNav.items.ringGroups',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-ring-groups',
        },
        {
          slug: 'shift-overrides',
          labelKey: 'adminNav.items.shiftOverrides',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-shift-overrides',
        },
      ],
    },
    {
      groupSlug: 'operations',
      scope: 'this-hub',
      labelKey: 'adminNav.groups.operations',
      items: [
        {
          slug: 'bans',
          labelKey: 'adminNav.items.bans',
          requiredPermissions: ['bans:read'],
          testid: 'admin-sidebar-item-bans',
        },
        {
          slug: 'audit',
          labelKey: 'adminNav.items.audit',
          requiredPermissions: ['audit:read'],
          testid: 'admin-sidebar-item-audit',
        },
        {
          slug: 'analytics',
          labelKey: 'adminNav.items.analytics',
          requiredPermissions: ['calls:read-history', 'audit:read'],
          testid: 'admin-sidebar-item-analytics',
        },
        {
          slug: 'health',
          labelKey: 'adminNav.items.health',
          requiredPermissions: ['settings:read'],
          testid: 'admin-sidebar-item-health',
        },
      ],
    },
    // Platform
    {
      groupSlug: 'platform',
      scope: 'platform',
      labelKey: 'adminNav.groups.platform',
      items: [
        {
          slug: 'hubs',
          labelKey: 'adminNav.items.hubs',
          requiredPermissions: ['system:manage-hubs'],
          requiredRole: 'role-super-admin',
          testid: 'admin-sidebar-item-hubs',
        },
        {
          slug: 'platform-roles',
          labelKey: 'adminNav.items.platformRoles',
          requiredPermissions: ['system:manage-roles'],
          requiredRole: 'role-super-admin',
          testid: 'admin-sidebar-item-platform-roles',
        },
        {
          slug: 'platform-bans',
          labelKey: 'adminNav.items.platformBans',
          requiredPermissions: ['bans:read'],
          requiredRole: 'role-super-admin',
          testid: 'admin-sidebar-item-platform-bans',
        },
        {
          slug: 'platform-audit',
          labelKey: 'adminNav.items.platformAudit',
          requiredPermissions: ['audit:read'],
          requiredRole: 'role-super-admin',
          testid: 'admin-sidebar-item-platform-audit',
        },
        {
          slug: 'platform-analytics',
          labelKey: 'adminNav.items.platformAnalytics',
          requiredPermissions: ['calls:read-history', 'audit:read'],
          requiredRole: 'role-super-admin',
          testid: 'admin-sidebar-item-platform-analytics',
        },
        {
          slug: 'platform-health',
          labelKey: 'adminNav.items.platformHealth',
          requiredPermissions: ['settings:read'],
          requiredRole: 'role-super-admin',
          testid: 'admin-sidebar-item-platform-health',
        },
        {
          slug: 'platform-settings',
          labelKey: 'adminNav.items.platformSettings',
          requiredPermissions: [],
          requiredRole: 'role-super-admin',
          testid: 'admin-sidebar-item-platform-settings',
        },
        {
          slug: 'gdpr-erasure',
          labelKey: 'adminNav.items.gdprErasure',
          requiredPermissions: ['settings:manage'],
          requiredRole: 'role-super-admin',
          testid: 'admin-sidebar-item-gdpr-erasure',
        },
      ],
    },
  ],
}

export function allNavItems() {
  return adminNavConfig.groups.flatMap((g) => g.items)
}

export function findNavItem(slug: string) {
  return allNavItems().find((i) => i.slug === slug)
}
