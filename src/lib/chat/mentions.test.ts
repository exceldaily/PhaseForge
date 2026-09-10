import { describe, expect, it } from 'vitest'
import { activeHandle, parseMentions } from './mentions'

const trades = ['Refrigeration', 'General Construction', 'HVAC']
const members = [
  { id: 'u1', name: 'Brad Harvey' },
  { id: 'u2', name: 'Christian Maitland' },
  { id: 'u3', name: 'Chris Bruzon' },
  { id: 'u4', name: 'Chris Byrd' },
]

describe('parseMentions', () => {
  it('finds trades, people, and everyone', () => {
    const { mentions, segments } = parseMentions('@Refrigeration heads up, @Brad can you check with @everyone?', trades, members)
    expect(mentions).toEqual({ everyone: true, trades: ['Refrigeration'], users: ['u1'] })
    expect(segments.map((s) => s.kind)).toEqual(['trade', 'text', 'user', 'text', 'everyone', 'text'])
  })
  it('prefers the longest handle so multi-word trades work', () => {
    const { mentions } = parseMentions('@General Construction crew on site tomorrow', trades, members)
    expect(mentions.trades).toEqual(['General Construction'])
    expect(mentions.users).toEqual([])
  })
  it('is case-insensitive and ignores emails', () => {
    const { mentions } = parseMentions('ping @hvac and @brad harvey, not brad@x.com', trades, members)
    expect(mentions.trades).toEqual(['HVAC'])
    expect(mentions.users).toEqual(['u1'])
  })
  it('does not guess between two people with the same first name', () => {
    expect(parseMentions('@Chris can you look', trades, members).mentions.users).toEqual([])
    expect(parseMentions('@Chris Byrd can you look', trades, members).mentions.users).toEqual(['u4'])
  })
  it('leaves plain text alone', () => {
    const { segments, mentions } = parseMentions('no handles here', trades, members)
    expect(segments).toEqual([{ text: 'no handles here', kind: 'text' }])
    expect(mentions).toEqual({ everyone: false, trades: [], users: [] })
  })
})

describe('activeHandle', () => {
  it('reports the handle under the caret', () => {
    expect(activeHandle('hey @Refr', 9)).toEqual({ start: 4, query: 'Refr' })
    expect(activeHandle('hey @Refr done', 9)).toEqual({ start: 4, query: 'Refr' })
    expect(activeHandle('mail brad@x', 11)).toBeNull()
    expect(activeHandle('nothing', 7)).toBeNull()
  })
})
