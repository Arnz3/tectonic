// Changes said in a meeting and verified by a person (fictional demo data).
// Each one overrules one sentence of an existing document and shows as a purple card on the timeline.
import { documents } from '../../library'
import type { GmDocument as Document } from './types'

/** A change from an earlier meeting that was already verified: one sentence of a document is overruled. */
function seedChange(c: {
  replaces: string
  oldSentence: string
  newSentence: string
  oldValue: string
  newValue: string
  title: string
  meeting: string
  date: string
  speaker: string
  line: string
  verifiedBy: string
}): Document {
  const old = documents.find((d) => d.id === c.replaces)!
  return {
    id: `meeting-seed-${c.replaces}`,
    title: c.title,
    filename: `${c.meeting}.transcript`,
    folder: 'Teams / Meetings',
    country: old.country,
    topic: old.topic,
    layer: old.layer,
    status: 'goedgekeurd',
    owner: c.verifiedBy,
    created: c.date,
    modified: c.date,
    text: `${c.newSentence}\n\nGewijzigd in “${c.meeting}” (${c.speaker}) en geverifieerd door ${c.verifiedBy}. Overschrijft één zin in “${old.title}”: “${c.oldSentence}”`,
    history: [{ author: c.verifiedBy, date: c.date, change: 'inhoud', summary: `Geverifieerd: ${c.oldValue} → ${c.newValue}` }],
    meeting: {
      title: c.meeting,
      date: c.date,
      speaker: c.speaker,
      line: c.line,
      oldValue: c.oldValue,
      newValue: c.newValue,
      oldSentence: c.oldSentence,
      newSentence: c.newSentence,
      replaces: c.replaces,
      verifiedBy: c.verifiedBy,
      verifiedAt: c.date,
    },
  }
}

/** Fictional changes from earlier meetings, so the purple updates are visible without running the demo. */
export const MEETING_CHANGES: Document[] = [
  seedChange({
    replaces: 'doc-07',
    oldSentence: 'Correcties op de eindejaarspremie moeten uiterlijk op 30 november bij de payrollconsultant binnen zijn.',
    newSentence: 'Correcties op de eindejaarspremie moeten uiterlijk op 25 november bij de payrollconsultant binnen zijn.',
    oldValue: '30 november',
    newValue: '25 november',
    title: 'Eindejaarspremie: deadline 25 november',
    meeting: 'Payroll weekmeeting',
    date: '2026-09-15',
    speaker: 'Sofie Claes',
    line: 'Let op: dit jaar moeten de correcties voor de eindejaarspremie al op 25 november binnen zijn, niet meer op 30 november.',
    verifiedBy: 'Pieter Wouters',
  }),
  seedChange({
    replaces: 'doc-16',
    oldSentence: 'Een voltijdse werknemer met een volledige referteperiode ontvangt ecocheques voor een totaal van € 250 per jaar.',
    newSentence: 'Een voltijdse werknemer met een volledige referteperiode ontvangt ecocheques voor een totaal van € 275 per jaar.',
    oldValue: '€ 250',
    newValue: '€ 275',
    title: 'Ecocheques: € 275 per jaar',
    meeting: 'Sociaal overleg Q3',
    date: '2026-07-08',
    speaker: 'Tom Vermeulen',
    line: 'Het nieuwe sectorakkoord is rond: de ecocheques gaan naar € 275 per jaar voor een voltijdse werknemer.',
    verifiedBy: 'An Peeters',
  }),
  seedChange({
    replaces: 'doc-08',
    oldSentence: 'Deze dagen moeten opgenomen worden vóór 31 maart van het volgende jaar.',
    newSentence: 'Deze dagen moeten opgenomen worden vóór 30 april van het volgende jaar.',
    oldValue: '31 maart',
    newValue: '30 april',
    title: 'Verlof: overdracht tot 30 april',
    meeting: 'HR-teamoverleg',
    date: '2026-05-20',
    speaker: 'Jens Maes',
    line: 'Directie heeft beslist dat overgedragen verlofdagen voortaan tot 30 april opgenomen mogen worden.',
    verifiedBy: 'Sofie Claes',
  }),
]

/** All documents, including the verified meeting changes. */
export const allDocuments: Document[] = [...documents, ...MEETING_CHANGES]
