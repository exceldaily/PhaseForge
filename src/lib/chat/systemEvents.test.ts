import { describe, expect, it } from 'vitest'
import { dayRangeLabel, departmentLabel, eventText, groupDays } from './systemEvents'

describe('groupDays', () => {
  it('collapses consecutive days with the same crew', () => {
    const g = groupDays([
      { date: '2026-09-07', names: ['Deivi', 'Marcos'] },
      { date: '2026-09-08', names: ['Marcos', 'Deivi'] },
      { date: '2026-09-09', names: ['Deivi', 'Marcos'] },
      { date: '2026-09-10', names: ['Deivi'] },
      { date: '2026-09-12', names: ['Deivi'] },
      { date: '2026-09-11', names: [] },
    ])
    expect(g).toEqual([
      { from: '2026-09-07', to: '2026-09-09', names: ['Deivi', 'Marcos'] },
      { from: '2026-09-10', to: '2026-09-10', names: ['Deivi'] },
      { from: '2026-09-12', to: '2026-09-12', names: ['Deivi'] },
    ])
  })
})

describe('labels', () => {
  it('reads day ranges', () => {
    expect(dayRangeLabel('2026-09-07', '2026-09-10')).toBe('Mon 9/7 to Thu 9/10')
    expect(dayRangeLabel('2026-09-12', '2026-09-12')).toBe('Sat 9/12')
  })
  it('title-cases departments', () => {
    expect(departmentLabel('REFRIGERATION')).toBe('Refrigeration')
    expect(departmentLabel('')).toBeNull()
  })
})

describe('eventText', () => {
  it('writes change order moves', () => {
    expect(eventText({ type: 'change_order', action: 'stage', coId: 'c', label: 'CO-26-00014', title: 'Replace condenser', from: 'Pricing Required', to: 'Approved', amount: 12400 }))
      .toBe('CO-26-00014 Replace condenser: Pricing Required to Approved ($12,400)')
    expect(eventText({ type: 'change_order', action: 'created', coId: 'c', label: 'CO-26-00015', title: 'Add rack', to: 'Potential Change' }))
      .toBe('CO-26-00015 opened: Add rack')
  })
  it('writes board moves', () => {
    expect(eventText({ type: 'board_move', projectName: 'Gulf Breeze', board: 'Refrigeration', from: 'Queue', to: 'In Progress' }))
      .toBe('Gulf Breeze moved from Queue to In Progress on Refrigeration')
    expect(eventText({ type: 'board_move', projectName: 'Gulf Breeze', board: 'Refrigeration', from: 'Queue', to: null }))
      .toBe('Gulf Breeze taken off Refrigeration')
  })
  it('writes a schedule with grouped days', () => {
    const text = eventText({
      type: 'schedule', team: 'Betancourt', department: 'REFRIGERATION', weekStart: '2026-09-06',
      jobs: [{ title: 'WM 2533 Gulf Breeze', jobNumber: '244621', url: null, days: [
        { date: '2026-09-07', names: ['Deivi', 'Marcos'] }, { date: '2026-09-08', names: ['Deivi', 'Marcos'] },
      ] }],
    })
    expect(text).toBe('Schedule: Betancourt (Refrigeration), week of 9/6\nWM 2533 Gulf Breeze (Job# 244621)\n  Mon 9/7 to Tue 9/8: Deivi, Marcos')
  })
})
