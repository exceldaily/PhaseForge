// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

const actions = vi.hoisted(() => ({
  ensureProjectChannel: vi.fn(async () => ({ ok: true as const, id: 'chan-p1' })),
  ensureDirectChannel: vi.fn(async () => ({ ok: true as const, id: 'chan-d1' })),
  createTradeChannel: vi.fn(async () => ({ ok: true as const, id: 'chan-t1' })),
  listMessages: vi.fn(async () => []),
  markRead: vi.fn(async () => undefined),
  sendMessage: vi.fn(async () => ({ ok: true as const, message: { id: 'm1', channelId: 'chan-g', authorId: 'me', body: 'hi', kind: 'message' as const, projectId: null, createdAt: new Date().toISOString(), editedAt: null, deleted: false, attachments: [] }, mirrored: null, pinged: 0 })),
  setMyTrades: vi.fn(async () => ({ ok: true as const, trades: [] })),
  editMessage: vi.fn(async () => ({ ok: true as const })),
  deleteMessage: vi.fn(async () => ({ ok: true as const })),
  signChatPhotos: vi.fn(async () => []),
  uploadChatPhotos: vi.fn(async () => ({ ok: true as const, attachments: [] })),
}))
vi.mock('./actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const ch = { on: () => ch, subscribe: () => ch }
    return { channel: () => ch, removeChannel: () => undefined }
  },
}))

import { ChatClient } from './ChatClient'

const base = {
  me: { id: 'me', name: 'Brad Harvey', trades: [] as string[] },
  companyId: 'co',
  channels: [
    { id: 'chan-g', kind: 'general' as const, name: 'General', trade: null, projectId: null, peerId: null, unread: 0, lastAt: null },
    { id: 'chan-r', kind: 'trade' as const, name: 'Refrigeration', trade: 'Refrigeration', projectId: null, peerId: null, unread: 2, lastAt: null },
  ],
  initialChannelId: 'chan-g',
  initialMessages: [],
  members: [{ id: 'me', name: 'Brad Harvey', avatarUrl: null, trades: [], title: null }, { id: 'u2', name: 'Christian Maitland', avatarUrl: null, trades: ['Refrigeration'], title: null }],
  trades: ['Refrigeration', 'HVAC'],
  projects: [{ id: 'p1', name: 'WM 2533 Gulf Breeze', jobNumber: '244621' }],
}

beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => cleanup())

describe('ChatClient', () => {
  it('opens a project space from the + picker', async () => {
    render(<ChatClient {...base} />)
    fireEvent.click(screen.getByTitle('New projects space'))
    fireEvent.click(await screen.findByText('WM 2533 Gulf Breeze'))
    await waitFor(() => expect(actions.ensureProjectChannel).toHaveBeenCalledWith({ projectId: 'p1' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Gulf Breeze'))
    expect(actions.listMessages).toHaveBeenCalledWith({ channelId: 'chan-p1' })
  })

  it('switches spaces and clears the unread badge', async () => {
    render(<ChatClient {...base} />)
    expect(screen.getAllByText('2').length).toBe(2)
    fireEvent.click(screen.getByText('Refrigeration', { selector: 'button span' }))
    await waitFor(() => expect(actions.listMessages).toHaveBeenCalledWith({ channelId: 'chan-r' }))
    await waitFor(() => expect(screen.queryByText('2')).toBeNull())
  })

  it('starts a direct message from the picker', async () => {
    render(<ChatClient {...base} />)
    fireEvent.click(screen.getByTitle('New direct messages space'))
    fireEvent.click(await screen.findByText('Christian Maitland'))
    await waitFor(() => expect(actions.ensureDirectChannel).toHaveBeenCalledWith({ profileId: 'u2' }))
  })

  it('sends on Enter and pings from the @ list', async () => {
    render(<ChatClient {...base} />)
    const box = screen.getByPlaceholderText(/Message General/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'heads up @Refr' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(box.value).toBe('heads up @Refrigeration '))
    fireEvent.change(box, { target: { value: 'heads up @Refrigeration crew' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(actions.sendMessage).toHaveBeenCalled())
    expect((actions.sendMessage.mock.calls as unknown as [unknown][])[0][0]).toMatchObject({ channelId: 'chan-g', body: 'heads up @Refrigeration crew' })
  })

  it('toggles my trades', async () => {
    render(<ChatClient {...base} />)
    fireEvent.click(screen.getByText('HVAC', { selector: 'button' }))
    await waitFor(() => expect(actions.setMyTrades).toHaveBeenCalledWith({ trades: ['HVAC'] }))
  })
})
