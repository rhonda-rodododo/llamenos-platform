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
  // ============ Navigation ============
  NAV_SIDEBAR: 'nav-sidebar',
  NAV_ADMIN_SECTION: 'nav-admin-section',

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
  NOTE_FORM: 'note-form',
  NOTE_CALL_ID: 'note-call-id',
  NOTE_CONTENT: 'note-content',

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
  RECOVERY_KEY: 'recovery-key',

  // ============ Conversations ============
  CONVERSATION_LIST: 'conversation-list',
  CONVERSATION_ITEM: 'conversation-item',
  CONVERSATION_THREAD: 'conversation-thread',
  MESSAGE_COMPOSER: 'message-composer',

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

  // ============ Security ============
  PANIC_WIPE_OVERLAY: 'panic-wipe-overlay',
  PIN_CHALLENGE_DIALOG: 'pin-challenge-dialog',
  PIN_CHALLENGE_ERROR: 'pin-challenge-error',
  PIN_INPUT: 'pin-input',

  // ============ Settings ============
  SETTINGS_SECTION: 'settings-section',
  TELEPHONY_PROVIDER: 'telephony-provider',
  ACCOUNT_SID: 'account-sid',
  AUTH_TOKEN: 'auth-token',
  API_KEY_SID: 'api-key-sid',
  TWIML_APP_SID: 'twiml-app-sid',
  RCS_AGENT_ID: 'rcs-agent-id',
  RCS_SERVICE_KEY: 'rcs-service-key',
  RCS_WEBHOOK_SECRET: 'rcs-webhook-secret',

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
