/**
 * Centralized data-testid constants matching the app source code.
 */
export const TestIds = {
  // Volunteers
  VOLUNTEER_ADD_BTN: 'volunteer-add-btn',
  VOLUNTEER_DEVICE_KEY_CODE: 'volunteer-device-key-code',
  VOLUNTEER_LIST: 'volunteer-list',
  VOLUNTEER_DELETE_BTN: 'volunteer-delete-btn',

  // Bans
  BAN_ADD_BTN: 'ban-add-btn',
  BAN_IMPORT_BTN: 'ban-import-btn',
  BAN_LIST: 'ban-list',
  BAN_FORM: 'ban-form',
  BAN_REMOVE_BTN: 'ban-remove-btn',
  BAN_BULK_FORM: 'ban-bulk-form',
  BAN_BULK_PHONES: 'ban-bulk-phones',

  // Shifts
  SHIFT_CREATE_BTN: 'shift-create-btn',
  SHIFT_FORM: 'shift-form',
  SHIFT_NAME_INPUT: 'shift-name-input',
  SHIFT_START_TIME: 'shift-start-time',
  SHIFT_END_TIME: 'shift-end-time',
  SHIFT_EDIT_BTN: 'shift-edit-btn',
  SHIFT_DELETE_BTN: 'shift-delete-btn',
  SHIFT_VOLUNTEER_COUNT: 'shift-volunteer-count',
  FALLBACK_GROUP_CARD: 'fallback-group-card',

  // Notes
  NOTE_NEW_BTN: 'note-new-btn',
  NOTE_EDIT_BTN: 'note-edit-btn',
  NOTE_REPLY_BTN: 'note-reply-btn',
  NOTE_THREAD: 'note-thread',
  NOTE_REPLY_TEXT: 'note-reply-text',
  NOTE_REPLY_SEND: 'note-reply-send',
  NOTE_FORM: 'note-form',
  NOTE_CALL_ID: 'note-call-id',
  NOTE_CONTENT: 'note-content',

  // Note Sheet
  NOTE_SHEET: 'note-sheet',
  SHEET_NOTE_TEXT: 'sheet-note-text',
  SHEET_SAVE_BTN: 'sheet-save-btn',

  // Calls
  CALL_SEARCH: 'call-search',
  CALL_SEARCH_BTN: 'call-search-btn',
  CALL_CLEAR_FILTERS: 'call-clear-filters',
  RECORDING_BADGE: 'recording-badge',
  RECORDING_PLAYER: 'recording-player',
  RECORDING_PLAY_BTN: 'recording-play-btn',

  // Conversations
  CONV_ADD_NOTE_BTN: 'conv-add-note-btn',

  // Settings
  LINK_CODE_INPUT: 'link-code-input',
  LINK_DEVICE_BUTTON: 'link-device-button',
  PRIMARY_SAS_CODE: 'primary-sas-code',
  CLIENT_TRANSCRIPTION_TOGGLE: 'client-transcription-toggle',

  // Admin Settings
  ACCOUNT_SID: 'account-sid',
  AUTH_TOKEN: 'auth-token',
  API_KEY_SID: 'api-key-sid',
  TWIML_APP_SID: 'twiml-app-sid',
  RCS_AGENT_ID: 'rcs-agent-id',
  RCS_SERVICE_KEY: 'rcs-service-key',
  RCS_WEBHOOK_SECRET: 'rcs-webhook-secret',

  // Device Linking
  LINK_DEVICE_CARD: 'link-device-card',
  START_LINKING: 'start-linking',
  PROVISIONING_QR: 'provisioning-qr',
  SHORT_CODE: 'short-code',
  SAS_CODE: 'sas-code',
  SAS_MATCH: 'sas-match',
  SAS_MISMATCH: 'sas-mismatch',
  CONTINUE_TO_LOGIN: 'continue-to-login',

  // Security
  PANIC_WIPE_OVERLAY: 'panic-wipe-overlay',
  PIN_CHALLENGE_DIALOG: 'pin-challenge-dialog',
  PIN_CHALLENGE_ERROR: 'pin-challenge-error',

  // Forms
  FORM_SAVE_BTN: 'form-save-btn',
  FORM_CANCEL_BTN: 'form-cancel-btn',
  FORM_SUBMIT_BTN: 'form-submit-btn',

  // Dialogs
  CONFIRM_DIALOG: 'confirm-dialog',
  CONFIRM_DIALOG_OK: 'confirm-dialog-ok',
  CONFIRM_DIALOG_CANCEL: 'confirm-dialog-cancel',

  // Onboarding
  RECOVERY_KEY: 'recovery-key',

  // Blasts
  BLAST_NAME: 'blast-name',
  BLAST_TEXT: 'blast-text',
  NO_BLASTS: 'no-blasts',

  // Contacts
  CONTACT_ROW: 'contact-row',

  // Reports
  CLOSE_REPORT: 'close-report',

  // Setup
  DISMISS_NSEC: 'dismiss-nsec',
  DISMISS_INVITE: 'dismiss-invite',
} as const
