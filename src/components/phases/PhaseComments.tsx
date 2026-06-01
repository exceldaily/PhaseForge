'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Comment {
  id: string
  body: string
  author_id: string
  created_at: string
  author?: { full_name: string } | null
}

interface PhaseCommentsProps {
  phaseId: string
  currentUserId: string
}

export function PhaseComments({ phaseId, currentUserId }: PhaseCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()

    supabase
      .from('phase_comments')
      .select('*, author:profiles(full_name)')
      .eq('phase_id', phaseId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setComments((data as Comment[]) ?? [])
        setLoading(false)
      })

    // Real-time subscription
    const channel = supabase
      .channel(`phase-comments-${phaseId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'phase_comments',
        filter: `phase_id=eq.${phaseId}`,
      }, (payload) => {
        const newComment = payload.new as Comment
        setComments(prev => {
          if (prev.some(c => c.id === newComment.id)) return prev
          return [...prev, newComment]
        })
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [phaseId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [loading])

  const handleSend = async () => {
    const trimmed = body.trim()
    if (!trimmed || sending) return

    setSending(true)
    setBody('')

    const supabase = createClient()
    const { data } = await supabase
      .from('phase_comments')
      .insert({ phase_id: phaseId, author_id: currentUserId, body: trimmed })
      .select('*, author:profiles(full_name)')
      .single()

    if (data) {
      setComments(prev => [...prev, data as Comment])
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setSending(false)
  }

  const handleDelete = async (id: string) => {
    setComments(prev => prev.filter(c => c.id !== id))
    const supabase = createClient()
    await supabase.from('phase_comments').delete().eq('id', id)
  }

  if (loading) {
    return <div className="px-5 py-4 text-xs text-slate-400">Loading comments…</div>
  }

  return (
    <div className="flex flex-col border-t border-slate-100">
      <div className="px-5 py-3 border-b border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Comments {comments.length > 0 && `(${comments.length})`}
        </p>
      </div>

      {/* Comment list */}
      <div className="max-h-52 overflow-y-auto px-5 py-3 space-y-3">
        {comments.length === 0 && (
          <p className="text-xs text-slate-400 py-2">No comments yet. Be the first.</p>
        )}
        {comments.map(c => (
          <div key={c.id} className={cn('group flex flex-col gap-0.5', c.author_id === currentUserId && 'items-end')}>
            <div className={cn(
              'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
              c.author_id === currentUserId
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : 'bg-slate-100 text-slate-800 rounded-tl-sm'
            )}>
              {c.body}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400">
                {c.author?.full_name ?? 'Unknown'} · {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {c.author_id === currentUserId && (
                <button onClick={() => handleDelete(c.id)}
                  className="hidden group-hover:flex text-slate-300 hover:text-rose-500 transition-colors">
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Add a comment…"
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        />
        <button onClick={handleSend} disabled={!body.trim() || sending}
          className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-40">
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}
