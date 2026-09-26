/**
 * Regression test for #1031: NotePayload.fields must be keyed by the custom
 * field definition's `name` (PROTOCOL.md Appendix B, iOS, Android) — never by
 * its `id` (a per-definition UUID). The map lives inside the note ciphertext,
 * so the server cannot catch a mismatch; values would silently vanish
 * cross-platform.
 */
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { render, fireEvent } from '@testing-library/react'
import type { CustomFieldDefinition, NotePayload } from '@shared/types'
import { CustomFieldInputs, validateCustomFields } from '../custom-field-inputs'
import { CustomFieldBadges } from '../custom-field-badges'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const severity: CustomFieldDefinition = {
  id: '6f1c2a0e-3b7d-4f5a-9c1e-0a2b3c4d5e6f',
  name: 'severity',
  label: 'Severity',
  type: 'text',
  required: true,
  visibleToUsers: true,
  editableByUsers: true,
  context: 'all',
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

/**
 * Cross-platform vector: the exact NotePayload JSON iOS and Android produce for
 * a note with one custom field "severity" = "high". Desktop must read and
 * write this shape byte-for-byte.
 */
const CROSS_PLATFORM_NOTE_PAYLOAD_JSON = '{"text":"Caller reported chest pain","fields":{"severity":"high"}}'

function textInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input')
  if (!input) throw new Error('expected a text input to be rendered')
  return input
}

describe('custom field values are keyed by field name', () => {
  it('CustomFieldInputs emits values under field.name, not field.id', () => {
    const onChange = vi.fn()
    const { container } = render(
      createElement(CustomFieldInputs, { fields: [severity], values: {}, onChange }),
    )
    fireEvent.change(textInput(container), { target: { value: 'high' } })
    expect(onChange).toHaveBeenCalledWith({ severity: 'high' })
  })

  it('CustomFieldInputs reads existing values from field.name', () => {
    const { container } = render(
      createElement(CustomFieldInputs, {
        fields: [severity],
        values: { severity: 'high' },
        onChange: vi.fn(),
      }),
    )
    expect(textInput(container).value).toBe('high')
  })

  it('CustomFieldBadges displays a value produced by another platform', () => {
    const payload = JSON.parse(CROSS_PLATFORM_NOTE_PAYLOAD_JSON) as NotePayload
    const { container } = render(
      createElement(CustomFieldBadges, { fields: [severity], values: payload.fields ?? {} }),
    )
    expect(container.textContent).toContain('Severity: high')
  })

  it('CustomFieldBadges does not read values keyed by field.id', () => {
    const { container } = render(
      createElement(CustomFieldBadges, { fields: [severity], values: { [severity.id]: 'high' } }),
    )
    expect(container.textContent).toBe('')
  })

  it('validateCustomFields validates by name and reports errors under name', () => {
    const t = (key: string) => key
    expect(validateCustomFields([severity], { severity: 'high' }, t, { isAdmin: true })).toEqual({})
    expect(validateCustomFields([severity], { [severity.id]: 'high' }, t, { isAdmin: true })).toEqual({
      severity: 'customFields.fieldRequired',
    })
  })

  it('a NotePayload built from inputs serialises to the cross-platform shape', () => {
    let values: Record<string, string | number | boolean> = {}
    const { container } = render(
      createElement(CustomFieldInputs, {
        fields: [severity],
        values,
        onChange: v => { values = v },
      }),
    )
    fireEvent.change(textInput(container), { target: { value: 'high' } })
    const payload: NotePayload = { text: 'Caller reported chest pain', fields: values }
    expect(JSON.stringify(payload)).toBe(CROSS_PLATFORM_NOTE_PAYLOAD_JSON)
  })
})
