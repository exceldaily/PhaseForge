'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Plus, ArrowLeft, AlertCircle, Package, Clock, Eye, EyeOff, Settings } from 'lucide-react'
import { DispatchBoard, DispatchColumn, DispatchCard, DispatchVendor, Profile } from '@/types/app'
import { DispatchCardModal } from './DispatchCardModal'
import { NewCardModal } from './NewCardModal'
import { BoardSettingsModal } from './BoardSettingsModal'
import { cn } from '@/lib/utils'
import { getDispatchFieldLabel, makeDispatchFieldHref } from '@/lib/dispatchFields'

interface Props {
  board: DispatchBoard
  columns: DispatchColumn[]
  initialCards: DispatchCard[]
  vendors: DispatchVendor[]
  members: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]
  userRole: string
  userId: string
}

const URGENCY_CONFIG = {
  critical: { label: 'Critical', bg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400', dot: 'bg-rose-500' },
  high:     { label: 'High',     bg: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-400' },
  medium:   { label: 'Medium',   bg: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', dot: 'bg-yellow-400' },
  low:      { label: 'Low',      bg: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400', dot: 'bg-slate-400' },
}

export function DispatchKanban({ board, columns, initialCards, vendors, members, userRole, userId }: Props) {
  const [cards, setCards] = useState<DispatchCard[]>(initialCards)
  const [selectedCard, setSelectedCard] = useState<DispatchCard | null>(null)
  const [newCardColumnId, setNewCardColumnId] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [currentBoard, setCurrentBoard] = useState<DispatchBoard>(board)

  // Filters
  const [filterUrgency, setFilterUrgency] = useState('')
  const [filterStore, setFilterStore] = useState('')
  const [filterNeedsReview, setFilterNeedsReview] = useState(false)

  const visibleCards = useMemo(() => {
    return cards.filter(c => {
      if (!showClosed && c.closed_at) return false
      if (filterUrgency && c.urgency !== filterUrgency) return false
      if (filterStore && !c.store?.toLowerCase().includes(filterStore.toLowerCase())) return false
      if (filterNeedsReview && !c.needs_review) return false
      return true
    })
  }, [cards, showClosed, filterUrgency, filterStore, filterNeedsReview])

  const cardsByColumn = useMemo(() => {
    const map: Record<string, DispatchCard[]> = {}
    for (const col of columns) map[col.id] = []
    map['__unassigned__'] = []
    for (const card of visibleCards) {
      const key = card.column_id ?? '__unassigned__'
      if (!map[key]) map[key] = []
      map[key].push(card)
    }
    return map
  }, [visibleCards, columns])

  const handleCardUpdated = (updated: DispatchCard) => {
    setCards(prev => prev.map(c => c.id === updated.id ? updated : c))
    if (selectedCard?.id === updated.id) setSelectedCard(updated)
  }

  const handleCardCreated = (card: DispatchCard) => {
    setCards(prev => [card, ...prev])
  }

  const handleCardDeleted = (cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId))
    setSelectedCard(null)
  }

  const closedCount = cards.filter(c => c.closed_at).length

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/app/dispatch"
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={15} />
            Dispatch
          </Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <h1 className="text-sm font-semibold text-slate-900 dark:text-white">{currentBoard.name}</h1>

          {/* Filters */}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {['owner', 'admin'].includes(userRole) && (
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                title="Board settings"
              >
                <Settings size={13} />
                Settings
              </button>
            )}
            <input
              type="text"
              placeholder="Filter by store..."
              value={filterStore}
              onChange={e => setFilterStore(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-36"
            />
            <select
              value={filterUrgency}
              onChange={e => setFilterUrgency(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All urgency</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button
              onClick={() => setFilterNeedsReview(v => !v)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-all',
                filterNeedsReview
                  ? 'bg-amber-50 border-amber-400 text-amber-700 dark:bg-amber-900/30 dark:border-amber-500 dark:text-amber-400'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              )}
            >
              <AlertCircle size={12} />
              Needs Review
            </button>
            {closedCount > 0 && (
              <button
                onClick={() => setShowClosed(v => !v)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-all',
                  showClosed
                    ? 'bg-slate-100 border-slate-400 text-slate-700 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                )}
              >
                {showClosed ? <EyeOff size={12} /> : <Eye size={12} />}
                {closedCount} closed
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full gap-4 p-4" style={{ minWidth: `${columns.length * 296 + 32}px` }}>
          {columns.map(col => (
            <KanbanColumn
              key={col.id}
              board={currentBoard}
              column={col}
              cards={cardsByColumn[col.id] ?? []}
              vendors={vendors}
              onCardClick={setSelectedCard}
              onAddCard={() => setNewCardColumnId(col.id)}
              userRole={userRole}
            />
          ))}
        </div>
      </div>

      {/* Board settings modal */}
      {showSettings && (
        <BoardSettingsModal
          board={currentBoard}
          columns={columns}
          onClose={() => setShowSettings(false)}
          onUpdated={b => { setCurrentBoard(b); setShowSettings(false) }}
        />
      )}

      {/* Card detail modal */}
      {selectedCard && (
        <DispatchCardModal
          card={selectedCard}
          board={currentBoard}
          columns={columns}
          vendors={vendors}
          members={members}
          onClose={() => setSelectedCard(null)}
          onUpdated={handleCardUpdated}
          onDeleted={handleCardDeleted}
          userRole={userRole}
          userId={userId}
        />
      )}

      {/* New card modal */}
      <NewCardModal
        open={newCardColumnId !== null}
        board={currentBoard}
        boardId={board.id}
        columnId={newCardColumnId}
        columns={columns}
        vendors={vendors}
        members={members}
        onClose={() => setNewCardColumnId(null)}
        onCreated={handleCardCreated}
      />
    </div>
  )
}

// ── KanbanColumn ──────────────────────────────────────────────────────────────

function KanbanColumn({
  board, column, cards, vendors, onCardClick, onAddCard, userRole,
}: {
  board: DispatchBoard
  column: DispatchColumn
  cards: DispatchCard[]
  vendors: DispatchVendor[]
  onCardClick: (card: DispatchCard) => void
  onAddCard: () => void
  userRole: string
}) {
  const canAdd = ['owner', 'admin', 'manager', 'member'].includes(userRole)

  return (
    <div className="flex flex-col w-72 shrink-0 bg-slate-50 dark:bg-slate-800/40 rounded-2xl overflow-hidden">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-700">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
        <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide truncate">
          {column.name}
        </span>
        <span className="text-xs text-slate-400 font-medium">{cards.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {cards.map(card => (
          <DispatchCardCompact
            key={card.id}
            board={board}
            card={card}
            vendors={vendors}
            onClick={() => onCardClick(card)}
          />
        ))}
      </div>

      {/* Add card */}
      {canAdd && (
        <div className="p-2 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onAddCard}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
          >
            <Plus size={13} />
            Add card
          </button>
        </div>
      )}
    </div>
  )
}

// ── DispatchCardCompact ───────────────────────────────────────────────────────

function DispatchCardCompact({
  board, card, vendors, onClick,
}: {
  board: DispatchBoard
  card: DispatchCard
  vendors: DispatchVendor[]
  onClick: () => void
}) {
  const urgencyConf = URGENCY_CONFIG[card.urgency] ?? URGENCY_CONFIG.medium
  const vendor = card.vendor_id ? vendors.find(v => v.id === card.vendor_id) : null
  const trackingHref = makeDispatchFieldHref(board, 'sc_number', card.sc_number)
  const jobHref = makeDispatchFieldHref(board, 'kalos_job_number', card.kalos_job_number)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left bg-white dark:bg-slate-900 border rounded-xl px-3 py-2.5 hover:shadow-sm hover:border-indigo-300 dark:hover:border-indigo-600 transition-all group',
        card.closed_at
          ? 'border-slate-200 dark:border-slate-700 opacity-60'
          : card.needs_review
          ? 'border-amber-300 dark:border-amber-700'
          : 'border-slate-200 dark:border-slate-700'
      )}
    >
      {/* Store + urgency */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
          {card.store || 'No store'}
        </span>
        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0', urgencyConf.bg)}>
          {urgencyConf.label}
        </span>
      </div>

      {/* SC # */}
      {card.sc_number && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
          {getDispatchFieldLabel(board, 'sc_number')}{' '}
          {trackingHref ? (
            <a href={trackingHref} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-indigo-600 dark:text-indigo-400 hover:underline">
              {card.sc_number}
            </a>
          ) : card.sc_number}
        </p>
      )}

      {/* Description */}
      {card.description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2">{card.description}</p>
      )}

      {/* Indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        {card.needs_review && (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle size={11} />
            Review
          </span>
        )}
        {card.part_ordered && (
          <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
            <Package size={11} />
            Part ordered
          </span>
        )}
        {card.eta_scheduled && (
          <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Clock size={11} />
            {new Date(card.eta_scheduled).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
        {vendor && (
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[100px]">
            {vendor.name}
          </span>
        )}
        {card.kalos_job_number && jobHref && (
          <a href={jobHref} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
            {getDispatchFieldLabel(board, 'kalos_job_number')}
          </a>
        )}
        {!card.kalos_job_number && (
          <span className="text-xs text-rose-500 font-medium ml-auto">No {getDispatchFieldLabel(board, 'kalos_job_number')}</span>
        )}
      </div>
    </button>
  )
}
