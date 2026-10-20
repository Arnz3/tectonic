/**
 * Signal data for "Wie weet het?": the precomputed signals.json plus what this browser added
 * (knowledge interviews and the organiser's one-click verification). There is no backend,
 * so additions live in localStorage and are validated like any other untrusted input.
 */
import { useMemo, useSyncExternalStore } from 'react'
import signalsJson from '../../data/signals.json'
import { analysis } from '../analysis'
import { parseSignal, parseSignalData, type ExpertContext, type Signal, type SignalData } from './model'

export const baseData: SignalData = parseSignalData(signalsJson)

const recommendedDocs = new Set(Object.keys(analysis.recommended))

/** Trust context for a topic from the document analysis: who mostly worked on outdated versions. */
export function expertContext(topic: string, confirmed: Set<string>): ExpertContext {
  const outdated = new Set(
    analysis.clusters.filter((c) => c.topic === topic).flatMap((c) => c.experts.filter((e) => e.warning).map((e) => e.author)),
  )
  return { outdated, recommendedDocs, confirmed }
}

const INTERVIEWS_KEY = 'tectonic.interviews.v1'
const VERIFIED_KEY = 'tectonic.verified.v1'
const MAX_INTERVIEWS = 50
export const MAX_ANSWER_LENGTH = 500

const names = new Set(baseData.people.map((p) => p.name))
const topicIds = new Set(baseData.topics.map((t) => t.id))
const signalIds = new Set(baseData.signals.map((s) => s.id))

export interface Verification {
  confirmed: string[]
  rejected: string[]
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: additions last for this page view only */
  }
}

function loadInterviews(): Signal[] {
  const raw = read(INTERVIEWS_KEY)
  return (Array.isArray(raw) ? raw : [])
    .map((s) => parseSignal(s, names, topicIds))
    .filter((s): s is Signal => s !== null && s.type === 'interview' && s.visibility === 'open')
    .slice(-MAX_INTERVIEWS)
}

function loadVerification(): Verification {
  const raw = read(VERIFIED_KEY)
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string' && signalIds.has(id)) : [])
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return { confirmed: ids(o.confirmed), rejected: ids(o.rejected) }
}

let interviews = loadInterviews()
let verification = loadVerification()
let version = 0
const listeners = new Set<() => void>()

function changed() {
  version++
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The transcript of a knowledge interview becomes a new signal for that person and topic. */
export function addInterview(person: string, topic: string, topicLabel: string, answer: string) {
  const text = answer.trim().slice(0, MAX_ANSWER_LENGTH)
  const signal = parseSignal(
    {
      id: `interview:${crypto.randomUUID()}`,
      type: 'interview',
      topic,
      daysAgo: 0,
      title: topicLabel,
      people: [{ name: person, role: 'explained', quote: text }],
      visibility: 'open',
      allowed: [],
    },
    names,
    topicIds,
  )
  if (!signal) return
  interviews = [...interviews, signal].slice(-MAX_INTERVIEWS)
  write(INTERVIEWS_KEY, interviews)
  changed()
}

/** The organiser's answer on the verification card: wrong signals stop counting. */
export function verify(confirmed: string[], rejected: string[]) {
  const known = (ids: string[]) => ids.filter((id) => signalIds.has(id))
  const touched = new Set([...confirmed, ...rejected])
  verification = {
    confirmed: [...verification.confirmed.filter((id) => !touched.has(id)), ...known(confirmed)],
    rejected: [...verification.rejected.filter((id) => !touched.has(id)), ...known(rejected)],
  }
  write(VERIFIED_KEY, verification)
  changed()
}

export function resetDemo() {
  interviews = []
  verification = { confirmed: [], rejected: [] }
  write(INTERVIEWS_KEY, interviews)
  write(VERIFIED_KEY, verification)
  changed()
}

export function usePeopleData() {
  const v = useSyncExternalStore(subscribe, () => version)
  // `v` changes whenever interviews or verification change.
  return useMemo(
    () => ({
      version: v,
      data: { ...baseData, signals: [...baseData.signals, ...interviews] } as SignalData,
      confirmed: new Set(verification.confirmed),
      rejected: new Set(verification.rejected),
    }),
    [v],
  )
}
