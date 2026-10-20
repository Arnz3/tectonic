import type { Document } from '../../types'

/** A change that was said in a meeting and verified by a person. */
export interface MeetingChange {
  title: string
  date: string
  speaker: string
  /** The literal line from the transcript. */
  line: string
  oldValue: string
  newValue: string
  /** The literal sentence in the original document, and what it says now. */
  oldSentence: string
  newSentence: string
  /** The document this change replaces. */
  replaces: string
  verifiedBy: string
  verifiedAt: string
}

/** A library document, or a verified meeting change that overrules one. */
export type GmDocument = Document & { meeting?: MeetingChange }
