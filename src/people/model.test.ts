// Run with `npm test` (node --test, Node 22.18+ strips the types).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { busFactorPerson, canSee, expertsFor, parseSignalData, sentence, topicForQuery, VIEWERS } from './model.ts'

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
