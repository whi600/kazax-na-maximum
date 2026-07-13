import { describe, expect, it } from 'vitest'
import { buildAuditTimeline, formatAuditEvent } from '../../src/audit/auditPresentation.js'

describe('audit presentation', () => {
  it('turns a shift assignment into a human-readable event', () => {
    expect(formatAuditEvent({
      action: 'shift.assign',
      after: {
        date: '2026-07-18',
        start_time: '09:00',
        end_time: '15:00',
        employee_name: 'Анна',
      },
      context: { assignedUserName: 'Анна' },
    })).toMatchObject({
      category: 'schedule',
      title: 'Сотрудник Анна назначен на смену',
      details: ['18 июля, 09:00–15:00'],
    })
  })

  it('describes a role change without technical field names', () => {
    expect(formatAuditEvent({
      action: 'user.role_update',
      before: { name: 'Маша', role: 'employee' },
      after: { name: 'Маша', role: 'admin' },
    })).toMatchObject({
      category: 'access',
      title: 'Изменена роль: Маша',
      details: ['Сотрудник → Администратор'],
    })
  })

  it('groups consecutive saves of the same report but keeps other events separate', () => {
    const timeline = buildAuditTimeline([
      {
        id: 3,
        action: 'daily_report.save',
        actor_user_id: 7,
        actor_name: 'Юля',
        entity_id: '2026-07-13',
        after: { record_date: '2026-07-13', entries_count: 12 },
        created_at: '2026-07-13T12:01:00.000Z',
      },
      {
        id: 2,
        action: 'daily_report.save',
        actor_user_id: 7,
        actor_name: 'Юля',
        entity_id: '2026-07-13',
        after: { record_date: '2026-07-13', entries_count: 12 },
        created_at: '2026-07-13T12:00:20.000Z',
      },
      {
        id: 1,
        action: 'shift.book',
        actor_user_id: 7,
        actor_name: 'Юля',
        after: {
          date: '2026-07-14',
          start_time: '09:00',
          end_time: '15:00',
          employee_name: 'Юля',
        },
        created_at: '2026-07-13T11:59:00.000Z',
      },
    ])

    expect(timeline).toHaveLength(2)
    expect(timeline[0]).toMatchObject({
      eventCount: 2,
      details: expect.arrayContaining(['Сохранений подряд: 2']),
    })
    expect(timeline[1].title).toContain('записан на смену')
  })
})
