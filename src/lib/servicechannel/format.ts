// Formatting helpers shared by server and client components. No React, no
// 'use client', so a server page can call them directly.

export const fmtDate = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-')
export const fmtWhen = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-')
export const scLink = (tracking: string) => `https://www.servicechannel.com/sc/wo/Workorders/index?id=${encodeURIComponent(tracking)}`
