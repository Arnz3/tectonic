/**
 * Signal data for "Wie weet het?": the precomputed signals.json plus what this browser added
 * (knowledge interviews, the organiser's one-click verification and micro-action answers on
 * contradicting new documents from checks.json). There is no backend,
 * so additions live in localStorage and are validated like any other untrusted input.
 */
import { useMemo, useSyncExternalStore } from 'react'
import checksJson from '../../data/checks.json'
import signalsJson from '../../data/signals.json'
import { analysis } from '../analysis'
import { documents } from '../library'
import { parseSignal, parseSignalData, VIEWERS, type ExpertContext, type Signal, type SignalData, type Viewer } from './model'

export const baseData: SignalData = parseSignalData(signalsJson)

const recommendedDocs = new Set(Object.keys(analysis.recommended))

/** Trust context for a topic from the document analysis: who mostly worked on outdated versions. */
export function expertContext(topic: string, confirmed: Set<string>): ExpertContext {
  const outdated = new Set(
    analysis.clusters.filter((c) => c.topic === topic).flatMap((c) => c.experts.filter((e) => e.warning).map((e) => e.author)),
  )
  return { outdated, recommendedDocs, confirmed }
}

// --- Micro actions: a new document contradicts the library -------------------------------

export interface Check {
  id: string
  newDoc: string
  existingDoc: string
  topic: string
  daysAgo: number
  statementNew: string
  statementExisting: string
  explanation: string
}

export type MicroAnswer = 'ja' | 'nee' | 'beide' | 'weet_niet'

export interface MicroReply {
  person: string
  answer: MicroAnswer
}

const docIds = new Set(documents.map((d) => d.id))
const isShortText = (v: unknown): v is string => typeof v === 'string' && v.length <= 500

function parseCheck(v: unknown): Check | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id.length > 100) return null
  if (typeof o.new_doc !== 'string' || !docIds.has(o.new_doc) || typeof o.existing_doc !== 'string' || !docIds.has(o.existing_doc)) return null
  if (typeof o.topic !== 'string' || typeof o.daysAgo !== 'number' || !Number.isInteger(o.daysAgo) || o.daysAgo < 0) return null
  if (!isShortText(o.statement_new) || !isShortText(o.statement_existing) || !isShortText(o.explanation)) return null
  return {
    id: o.id,
    newDoc: o.new_doc,
    existingDoc: o.existing_doc,
    topic: o.topic,
    daysAgo: o.daysAgo,
    statementNew: o.statement_new,
    statementExisting: o.statement_existing,
    explanation: o.explanation,
  }
}

export const checks: Check[] = ((checksJson as { checks?: unknown[] }).checks ?? []).map(parseCheck).filter((c): c is Check => c !== null)
const checkIds = new Set(checks.map((c) => c.id))

const MICRO_KEY = 'tectonic.microactions.v1'
const ANSWERS: MicroAnswer[] = ['ja', 'nee', 'beide', 'weet_niet']

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

/** Per check the replies so far, in order; 'weet_niet' passes the question to the next person. */
function loadReplies(): Record<string, MicroReply[]> {
  const raw = read(MICRO_KEY)
  const result: Record<string, MicroReply[]> = {}
  if (typeof raw !== 'object' || raw === null) return result
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!checkIds.has(id) || !Array.isArray(list)) continue
    result[id] = list
      .filter((r): r is MicroReply => typeof r === 'object' && r !== null && names.has(r.person) && ANSWERS.includes(r.answer))
      .map((r) => ({ person: r.person, answer: r.answer }))
      .slice(0, 10)
  }
  return result
}

const VIEWER_KEY = 'tectonic.viewer'

/** "Bekijk als": shared by Graffify and the document side panel, so both hide the same sources. */
function loadViewer(): Viewer {
  try {
    return VIEWERS.find((v) => v.id === localStorage.getItem(VIEWER_KEY)) ?? VIEWERS[0]
  } catch {
    return VIEWERS[0]
  }
}

let viewer = loadViewer()

export function setViewer(next: Viewer) {
  viewer = next
  try {
    localStorage.setItem(VIEWER_KEY, next.id)
  } catch {
    /* storage unavailable */
  }
  changed()
}

let replies = loadReplies()
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

/** One tap in Teams. A real answer (not 'weet ik niet') also counts as a signal for that person. */
export function answerCheck(checkId: string, person: string, answer: MicroAnswer) {
  if (!checkIds.has(checkId) || !names.has(person) || !ANSWERS.includes(answer)) return
  replies = { ...replies, [checkId]: [...(replies[checkId] ?? []), { person, answer }].slice(0, 10) }
  write(MICRO_KEY, replies)
  changed()
}

function validationSignals(): Signal[] {
  const titleOf = new Map(documents.map((d) => [d.id, d.title]))
  return checks.flatMap((c) =>
    (replies[c.id] ?? [])
      .filter((r) => r.answer !== 'weet_niet')
      .flatMap((r) => {
        const signal = parseSignal(
          {
            id: `validation:${c.id}:${r.person}`,
            type: 'teams',
            topic: c.topic,
            daysAgo: 0,
            title: `Validatie: ${titleOf.get(c.newDoc) ?? c.newDoc}`,
            people: [{ name: r.person, role: 'answered', quote: '' }],
            visibility: 'open',
            allowed: [],
          },
          names,
          topicIds,
        )
        return signal ? [signal] : []
      }),
  )
}

export function resetDemo() {
  replies = {}
  write(MICRO_KEY, replies)
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
      data: { ...baseData, signals: [...baseData.signals, ...interviews, ...validationSignals()] } as SignalData,
      replies,
      viewer,
      confirmed: new Set(verification.confirmed),
      rejected: new Set(verification.rejected),
    }),
    [v],
  )
}
