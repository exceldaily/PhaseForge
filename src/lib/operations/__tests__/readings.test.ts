import { describe, it, expect } from 'vitest'
import { DEFAULT_READING_TEMPLATES, readingFieldsForTrade, mapsUrl } from '../readings'

describe('readingFieldsForTrade', () => {
  it('returns HVAC fields for hvac trade', () => {
    const fields = readingFieldsForTrade('hvac')
    const keys = fields.map((f) => f.key)
    expect(keys).toContain('suction_psi')
    expect(keys).toContain('superheat_f')
    expect(keys).toContain('subcooling_f')
  })

  it('returns plumbing fields for plumbing trade', () => {
    const keys = readingFieldsForTrade('plumbing').map((f) => f.key)
    expect(keys).toContain('water_pressure_psi')
    expect(keys).toContain('leak_check')
  })

  it('falls back to general for unknown or missing trades', () => {
    expect(readingFieldsForTrade('roofing')).toEqual(DEFAULT_READING_TEMPLATES.general)
    expect(readingFieldsForTrade(null)).toEqual(DEFAULT_READING_TEMPLATES.general)
    expect(readingFieldsForTrade(undefined)).toEqual(DEFAULT_READING_TEMPLATES.general)
  })

  it('every field has a key, label, and valid type', () => {
    for (const [trade, fields] of Object.entries(DEFAULT_READING_TEMPLATES)) {
      for (const f of fields) {
        expect(f.key, `${trade}.${f.key}`).toBeTruthy()
        expect(f.label, `${trade}.${f.key}`).toBeTruthy()
        expect(['number', 'text', 'select']).toContain(f.type)
        if (f.type === 'select') {
          expect(f.options?.length, `${trade}.${f.key} options`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('field keys are unique within each trade', () => {
    for (const [trade, fields] of Object.entries(DEFAULT_READING_TEMPLATES)) {
      const keys = fields.map((f) => f.key)
      expect(new Set(keys).size, trade).toBe(keys.length)
    }
  })
})

describe('mapsUrl', () => {
  it('builds an encoded Google Maps search URL', () => {
    const url = mapsUrl('1234 Wallaby Way', 'Orlando', 'FL')
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=1234%20Wallaby%20Way%2C%20Orlando%2C%20FL')
  })

  it('skips null/undefined/empty parts', () => {
    expect(mapsUrl(null, 'Orlando', undefined, '', 'FL')).toContain('Orlando%2C%20FL')
  })

  it('returns null when there is no address at all', () => {
    expect(mapsUrl(null, undefined, '')).toBeNull()
  })
})
