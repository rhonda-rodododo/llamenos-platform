import { describe, it, expect } from 'bun:test'
import { renderStatusChangeNotification } from '@worker/lib/notification-templates'

describe('renderStatusChangeNotification', () => {
  it('renders message with case number', () => {
    const result = renderStatusChangeNotification('CASE-123', 'report', 'Resolved')
    expect(result).toBe('Update on report CASE-123: Status changed to Resolved.')
  })

  it('renders generic message when case number is empty string', () => {
    const result = renderStatusChangeNotification('', 'report', 'Pending')
    expect(result).toBe('Update: Status changed to Pending.')
  })

  it('renders generic message when case number is whitespace-only', () => {
    const result = renderStatusChangeNotification('   ', 'incident', 'Open')
    expect(result).toBe('Update on incident    : Status changed to Open.')
  })

  it('handles different entity types', () => {
    const result = renderStatusChangeNotification('42', 'case', 'Closed')
    expect(result).toBe('Update on case 42: Status changed to Closed.')
  })

  it('handles status labels with spaces', () => {
    const result = renderStatusChangeNotification('99', 'note', 'In Progress')
    expect(result).toBe('Update on note 99: Status changed to In Progress.')
  })

  it('handles numeric case numbers as strings', () => {
    const result = renderStatusChangeNotification('007', 'ticket', 'Escalated')
    expect(result).toBe('Update on ticket 007: Status changed to Escalated.')
  })
})
