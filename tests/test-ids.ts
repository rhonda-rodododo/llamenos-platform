/**
 * Centralized test ID constants for Playwright tests.
 *
 * These IDs are used with data-testid attributes in components and
 * getByTestId() in tests. Centralizing them ensures:
 * 1. Type safety - IDE autocomplete for test IDs
 * 2. Single source of truth - rename in one place
 * 3. Discoverability - all test IDs in one file
 *
 * Naming convention: SECTION_ELEMENT_ACTION
 * e.g., VOLUNTEER_ROW_DELETE, SHIFT_CARD_EDIT
 */

export const TestIds = {
  // ============ Page ============
  PAGE_TITLE: 'page-title',

  // ============ Navigation ============
  NAV_SIDEBAR: 'nav-sidebar',
  NAV_ADMIN_SECTION: 'nav-admin-section',
  NAV_DASHBOARD: 'nav-dashboard',
  NAV_NOTES: 'nav-notes',
  NAV_CONVERSATIONS: 'nav-conversations',
  NAV_REPORTS: 'nav-reports',
  NAV_BLASTS: 'nav-blasts',
  NAV_CALLS: 'nav-calls',
  NAV_SETTINGS: 'nav-settings',
  NAV_SHIFTS: 'nav-shifts',
  NAV_VOLUNTEERS: 'nav-volunteers',
  NAV_BANS: 'nav-bans',
  NAV_CONTACTS: 'nav-contacts',
  NAV_AUDIT: 'nav-audit',
  NAV_ADMIN_SETTINGS: 'nav-admin-settings',
  NAV_ADMIN_HUBS: 'nav-admin-hubs',
  NAV_HELP: 'nav-help',
  LOGOUT_BTN: 'logout-btn',

  // ============ Volunteers ============
  VOLUNTEER_LIST: 'volunteer-list',
  VOLUNTEER_ROW: 'volunteer-row',
  VOLUNTEER_ADD_BTN: 'volunteer-add-btn',
  VOLUNTEER_DELETE_BTN: 'volunteer-delete-btn',
  VOLUNTEER_EDIT_BTN: 'volunteer-edit-btn',
  VOLUNTEER_NSEC_CARD: 'volunteer-nsec-card',
  VOLUNTEER_NSEC_CODE: 'volunteer-nsec-code',
  VOLUNTEER_INVITE_CARD: 'volunteer-invite-card',
  VOLUNTEER_INVITE_LINK: 'volunteer-invite-link',
  DISMISS_NSEC: 'dismiss-nsec',
  DISMISS_INVITE: 'dismiss-invite',
  TOGGLE_PHONE_VISIBILITY: 'toggle-phone-visibility',
  INVITE_BTN: 'invite-btn',
  REVOKE_INVITE_BTN: 'revoke-invite-btn',

  // ============ Shifts ============
  SHIFT_LIST: 'shift-list',
  SHIFT_CARD: 'shift-card',
  SHIFT_CREATE_BTN: 'shift-create-btn',
  SHIFT_EDIT_BTN: 'shift-edit-btn',
  SHIFT_DELETE_BTN: 'shift-delete-btn',
  SHIFT_FORM: 'shift-form',
  SHIFT_NAME_INPUT: 'shift-name-input',
  SHIFT_START_TIME: 'shift-start-time',
  SHIFT_END_TIME: 'shift-end-time',
  SHIFT_VOLUNTEER_COUNT: 'shift-volunteer-count',
  FALLBACK_GROUP_CARD: 'fallback-group-card',

  // ============ Ban List ============
  BAN_LIST: 'ban-list',
  BAN_ROW: 'ban-row',
  BAN_ADD_BTN: 'ban-add-btn',
  BAN_IMPORT_BTN: 'ban-import-btn',
  BAN_REMOVE_BTN: 'ban-remove-btn',
  BAN_FORM: 'ban-form',
  BAN_BULK_FORM: 'ban-bulk-form',

  // ============ Notes ============
  NOTE_LIST: 'note-list',
  NOTE_CARD: 'note-card',
  NOTE_NEW_BTN: 'note-new-btn',
  NOTE_EDIT_BTN: 'note-edit-btn',
  NOTE_EDIT_INPUT: 'note-edit-input',
  NOTE_DETAIL_TEXT: 'note-detail-text',
  NOTE_SEARCH: 'note-search',
  NOTE_FORM: 'note-form',
  NOTE_CALL_ID: 'note-call-id',
  NOTE_CONTENT: 'note-content',
  NOTE_REPLY_BTN: 'note-reply-btn',
  NOTE_THREAD: 'note-thread',
  NOTE_REPLY_TEXT: 'note-reply-text',
  NOTE_REPLY_SEND: 'note-reply-send',
  NOTE_SHEET: 'note-sheet',
  SHEET_NOTE_TEXT: 'sheet-note-text',
  SHEET_SAVE_BTN: 'sheet-save-btn',

  // ============ Calls ============
  CALL_LIST: 'call-list',
  CALL_ROW: 'call-row',
  CALL_SEARCH: 'call-search',
  CALL_SEARCH_BTN: 'call-search-btn',
  CALL_CLEAR_FILTERS: 'call-clear-filters',
  RECORDING_BADGE: 'recording-badge',
  RECORDING_PLAYER: 'recording-player',
  RECORDING_PLAY_BTN: 'recording-play-btn',

  // ============ Reports ============
  REPORT_LIST: 'report-list',
  REPORT_CARD: 'report-card',
  REPORT_NEW_BTN: 'report-new-btn',
  REPORT_CLOSE_BTN: 'close-report',
  REPORT_CLAIM_BTN: 'report-claim-btn',
  REPORT_DETAIL: 'report-detail',
  REPORT_TITLE_INPUT: 'report-title-input',
  REPORT_BODY_INPUT: 'report-body-input',
  REPORT_SUBMIT_BTN: 'report-submit-btn',
  REPORT_METADATA: 'report-metadata',
  REPORT_STATUS_BADGE: 'report-status-badge',
  REPORT_FILTER_AREA: 'report-filter-area',
  RECOVERY_KEY: 'recovery-key',

  // ============ Conversations ============
  CONVERSATION_LIST: 'conversation-list',
  CONVERSATION_ITEM: 'conversation-item',
  CONVERSATION_THREAD: 'conversation-thread',
  MESSAGE_COMPOSER: 'message-composer',
  CONV_ADD_NOTE_BTN: 'conv-add-note-btn',
  CONV_ASSIGN_BTN: 'conv-assign-btn',
  CONV_CLOSE_BTN: 'conv-close-btn',
  CONV_REOPEN_BTN: 'conv-reopen-btn',
  CONV_SEND_BTN: 'conv-send-btn',

  // ============ Contacts ============
  CONTACT_ROW: 'contact-row',

  // ============ Blasts ============
  BLAST_LIST: 'blast-list',
  BLAST_CARD: 'blast-card',
  BLAST_NEW_BTN: 'blast-new-btn',
  BLAST_NAME: 'blast-name',
  BLAST_TEXT: 'blast-text',
  NO_BLASTS: 'no-blasts',

  // ============ Device Linking ============
  LINK_DEVICE_CARD: 'link-device-card',
  START_LINKING: 'start-linking',
  PROVISIONING_QR: 'provisioning-qr',
  SHORT_CODE: 'short-code',
  LINK_CODE_INPUT: 'link-code-input',
  LINK_DEVICE_BUTTON: 'link-device-button',
  CONTINUE_TO_LOGIN: 'continue-to-login',

  // ============ Auth / Login ============
  LOGIN_SUBMIT_BTN: 'login-submit-btn',
  GO_TO_SETUP_BTN: 'go-to-setup-btn',
  LOCK_BTN: 'lock-btn',
  RECOVERY_OPTIONS_BTN: 'recovery-options-btn',

  // ============ Security ============
  PANIC_WIPE_OVERLAY: 'panic-wipe-overlay',
  EMERGENCY_WIPE_BTN: 'emergency-wipe-btn',
  PIN_CHALLENGE_DIALOG: 'pin-challenge-dialog',
  PIN_CHALLENGE_ERROR: 'pin-challenge-error',
  PIN_INPUT: 'pin-input',

  // ============ Audit ============
  AUDIT_ENTRY: 'audit-entry',
  AUDIT_SEARCH: 'audit-search',
  AUDIT_EVENT_FILTER: 'audit-event-filter',

  // ============ Roles ============
  ROLE_ROW: 'role-row',
  ROLE_CREATE_BTN: 'role-create-btn',
  ROLE_DELETE_BTN: 'role-delete-btn',

  // ============ Custom Fields ============
  CUSTOM_FIELD_ROW: 'custom-field-row',
  CUSTOM_FIELD_ADD_BTN: 'custom-field-add-btn',
  CUSTOM_FIELD_DELETE_BTN: 'custom-field-delete-btn',
  CUSTOM_FIELD_SECTION: 'custom-field-section',
  CUSTOM_FIELD_TYPE_SELECT: 'custom-field-type-select',
  CUSTOM_FIELD_ADD_OPTION_BTN: 'custom-field-add-option-btn',

  // ============ Conversation Filters ============
  CONV_FILTER_CHIP: 'conv-filter-chip',
  CONV_SECTION_HEADER: 'conv-section-header',

  // ============ Volunteer Profile ============
  VOLUNTEER_NAME: 'volunteer-name',
  VOLUNTEER_PUBKEY: 'volunteer-pubkey',
  VOLUNTEER_ROLE_BADGE: 'volunteer-role-badge',
  VOLUNTEER_STATUS_BADGE: 'volunteer-status-badge',
  VOLUNTEER_JOIN_DATE: 'volunteer-join-date',
  VOLUNTEER_ACTIVITY_CARD: 'volunteer-activity-card',

  // ============ Dashboard ============
  DASHBOARD_ACTIVE_CALLS: 'dashboard-active-calls',
  DASHBOARD_SHIFT_STATUS: 'dashboard-shift-status',
  DASHBOARD_CALLS_TODAY: 'dashboard-calls-today',
  DASHBOARD_QUICK_ACTIONS: 'dashboard-quick-actions',
  BREAK_TOGGLE_BTN: 'break-toggle-btn',

  // ============ Settings ============
  SETTINGS_SECTION: 'settings-section',
  SETTINGS_ADVANCED_SECTION: 'settings-advanced-section',
  SETTINGS_AUTO_LOCK: 'settings-auto-lock',
  SETTINGS_DEBUG_LOG: 'settings-debug-log',
  SETTINGS_CLEAR_CACHE: 'settings-clear-cache',
  TELEPHONY_PROVIDER: 'telephony-provider',
  ACCOUNT_SID: 'account-sid',
  AUTH_TOKEN: 'auth-token',
  API_KEY_SID: 'api-key-sid',
  TWIML_APP_SID: 'twiml-app-sid',
  RCS_AGENT_ID: 'rcs-agent-id',
  RCS_SERVICE_KEY: 'rcs-service-key',
  RCS_WEBHOOK_SECRET: 'rcs-webhook-secret',

  // ============ Theme ============
  THEME_SYSTEM: 'theme-system',
  THEME_LIGHT: 'theme-light',
  THEME_DARK: 'theme-dark',

  // ============ Admin Settings ============
  TRANSCRIPTION_SECTION: 'transcription',
  SPAM_SECTION: 'spam-section',

  // ============ Setup Wizard ============
  SETUP_WIZARD: 'setup-wizard',
  SETUP_STEP: 'setup-step',
  SETUP_NEXT_BTN: 'setup-next-btn',
  SETUP_BACK_BTN: 'setup-back-btn',
  SETUP_SKIP_BTN: 'setup-skip-btn',

  // ============ Forms (Generic) ============
  FORM_SAVE_BTN: 'form-save-btn',
  FORM_CANCEL_BTN: 'form-cancel-btn',
  FORM_SUBMIT_BTN: 'form-submit-btn',

  // ============ Dialogs ============
  CONFIRM_DIALOG: 'confirm-dialog',
  CONFIRM_DIALOG_OK: 'confirm-dialog-ok',
  CONFIRM_DIALOG_CANCEL: 'confirm-dialog-cancel',

  // ============ Misc ============
  EMPTY_STATE: 'empty-state',
  LOADING_SKELETON: 'loading-skeleton',
  ERROR_MESSAGE: 'error-message',
  SUCCESS_TOAST: 'success-toast',
  IMPORT_CSV: 'import-csv',
  BACK_BTN: 'back-btn',
} as const

export type TestId = (typeof TestIds)[keyof typeof TestIds]

/**
 * Helper to create a data-testid selector string for use in tests.
 * Example: testId('volunteer-row') => '[data-testid="volunteer-row"]'
 */
export function testIdSelector(id: TestId): string {
  return `[data-testid="${id}"]`
}

/**
 * Helper to create a data-testid attribute value for a row item with an identifier.
 * Example: rowTestId('volunteer-row', 'abc123') => 'volunteer-row-abc123'
 */
export function rowTestId(baseId: TestId, identifier: string): string {
  return `${baseId}-${identifier}`
}

/**
 * Map from human-readable page names to their nav link test IDs.
 * Used by step definitions like "I navigate to the {string} page".
 */
export const navTestIdMap: Record<string, string> = {
  'Dashboard': 'nav-dashboard',
  'Notes': 'nav-notes',
  'Conversations': 'nav-conversations',
  'Reports': 'nav-reports',
  'Blasts': 'nav-blasts',
  'Call History': 'nav-calls',
  'Calls': 'nav-calls',
  'Settings': 'nav-settings',
  'Shifts': 'nav-shifts',
  'Volunteers': 'nav-volunteers',
  'Ban List': 'nav-bans',
  'Bans': 'nav-bans',
  'Contacts': 'nav-contacts',
  'Audit Log': 'nav-audit',
  'Hub Settings': 'nav-admin-settings',
  'Admin Settings': 'nav-admin-settings',
  'Help': 'nav-help',
}
