// Run with `npm test` (node --test, Node 22.18+ strips the types).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { busFactorPerson, canSee, contactsForQuery, expertsFor, involvementText, parseSignalData, sentence, topicForQuery, VIEWERS } from './model.ts'

const data = parseSignalData(JSON.parse(readFileSync(new URL('../../data/signals.json', import.meta.url), 'utf8')))
const [consultant, newcomer] = VIEWERS

const raw = {
  people: [{ name: 'An', role: 'x', team: 'Payroll BE', status: 'actief' }],
  topics: [{ id: 'geheim', label: 'Geheim', synonyms: [] }],
  signals: [
    { id: 's1', type: 'meeting', topic: 'geheim', daysAgo: 1, title: 'Reorganisatie', visibility: 'vertrouwelijk', allowed: ['Directie'],
      people: [{ name: 'An', role: 'explained', quote: 'geheim' }] },
    { id: 's2', type: 'meeting', topic: 'geheim', daysAgo: 1, title: 'Gewoon', visibility: 'open', allowed: [],
      people: [{ name: 'An', role: 'explained', quote: '' }] },
  ],
}

test('confidential signals never get through parsing', () => {
  const parsed = parseSignalData(raw)
  assert.deepEqual(parsed.signals.map((s) => s.id), ['s2'])
  assert.ok(data.signals.every((s) => s.visibility !== 'vertrouwelijk'))
})

test('canSee: confidential is hidden for every viewer', () => {
  for (const viewer of VIEWERS) {
    assert.equal(canSee({ visibility: 'vertrouwelijk', allowed: viewer.teams }, viewer), false)
  }
  assert.equal(canSee({ visibility: 'beperkt', allowed: ['Reward & Benefits'] }, consultant), true)
  assert.equal(canSee({ visibility: 'beperkt', allowed: ['Reward & Benefits'] }, newcomer), false)
  assert.equal(canSee({ visibility: 'open', allowed: [] }, newcomer), true)
})

test('malformed or unknown entries are dropped', () => {
  const bad = structuredClone(raw)
  bad.signals[1].people[0].name = 'Onbekend'
  assert.equal(parseSignalData(bad).signals.length, 0)
  assert.equal(parseSignalData(null).signals.length, 0)
})

test('demo: Karim is the contact for the fuel card, for every viewer', () => {
  const topic = topicForQuery('wie kent de tankkaart?', data.topics)
  assert.equal(topic?.id, 'bedrijfswagens')
  const [best] = expertsFor('bedrijfswagens', data)
  assert.equal(best.person.name, 'Karim El Amrani')
  assert.equal(sentence(best.person.name, best.headline, true), 'Karim had 4 dagen geleden een meeting hierover en gaf er uitleg')
  assert.equal(busFactorPerson('bedrijfswagens', data)?.name, 'Karim El Amrani')
})

test('hidden sentences reveal no title', () => {
  const restricted = data.signals.find((s) => s.id === 'meeting-02:bedrijfswagens')!
  const text = sentence('Karim El Amrani', { signal: restricted, role: 'explained' }, false)
  assert.equal(text, 'Karim gaf vorige week uitleg in een afgeschermde meeting')
  assert.ok(!text.includes(restricted.title))
})

test('why: involvement counts signals per source, without titles', () => {
  const karim = expertsFor('bedrijfswagens', data).find((e) => e.person.name === 'Karim El Amrani')!
  assert.equal(
    involvementText(karim.involvement),
    'Al 2 weken mee bezig · 4 signalen: 2 meetings, 1 Teams-antwoord, 1 ticket · laatst 4 dagen geleden',
  )
})

test('who: mostly outdated work lowers the verdict and the rank', () => {
  const experts = expertsFor('maaltijdcheques', data, new Set(), { outdated: new Set(['Tom Vermeulen']), recommendedDocs: new Set(['doc-01']) })
  const an = experts.find((e) => e.person.name === 'An Peeters')!
  const tom = experts.find((e) => e.person.name === 'Tom Vermeulen')!
  assert.equal(experts[0], an)
  assert.equal(an.verdict, 'likely')
  assert.equal(tom.verdict, 'outdated')
  assert.ok(tom.involvement.signals > an.involvement.signals)
})

test('no files: contacts come from meetings and Teams that mention the words', () => {
  const contacts = contactsForQuery('wie weet iets over de laadpas?', data)
  assert.equal(contacts[0]?.person.name, 'Karim El Amrani')
  assert.ok(contacts.every((c) => c.headline.signal.type === 'meeting' || c.headline.signal.type === 'teams'))
  assert.deepEqual(contactsForQuery('wie weet iets?', data), [])
})
