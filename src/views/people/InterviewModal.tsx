import { useEffect, useState } from 'react'
import { firstName, type Topic } from '../../people/model'
import { addInterview, MAX_ANSWER_LENGTH } from '../../people/store'

const QUESTIONS = [
  (t: string) => `Wat moet een collega absoluut weten over ${t}?`,
  () => 'Welke fout zie je het vaakst, en hoe vermijd je die?',
  () => 'Waar staat de juiste informatie, of wie vraag je als jij er niet bent?',
]

/** Fictional answers so the demo runs without typing. */
const DEMO_ANSWERS: Record<string, string[]> = {
  bedrijfswagens: [
    'De tankkaart hoort bij de nummerplaat, niet bij de persoon. Bij een vervangwagen vraag je altijd een nieuwe kaart aan in het fleetportaal.',
    'Mensen laden thuis met de tankkaart in plaats van met de laadpas, en dan wordt het niet terugbetaald.',
    'Het fleetportaal en het kanaal #fleet. Bij mijn afwezigheid kan Sofie de aanvragen goedkeuren.',
  ],
  thuiswerk: [
    'De thuiswerkvergoeding is forfaitair en maandelijks, voor wie structureel minstens één dag per week thuiswerkt.',
    'Het plafond wordt per klant anders ingesteld; controleer altijd het bedrag dat de klant bevestigde.',
    'De klantafspraken in het klantendossier. Lotte zat mee in het overleg en kan helpen.',
  ],
}
const GENERIC_ANSWERS = [
  'De procedure in de bibliotheek is de basis; klantafspraken gaan altijd voor.',
  'Er circuleren oude kopieën; kijk altijd naar de goedgekeurde versie.',
  'De procedure in de bibliotheek en het teamkanaal.',
]

/**
 * Knowledge interview (design doc, M3). In production an ElevenLabs voice asks the questions;
 * this demo uses the browser's own speech synthesis when available. The answers become a signal.
 */
export function InterviewModal({ person, topic, onClose }: { person: string; topic: Topic; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState(['', '', ''])
  const [voice, setVoice] = useState(true)
  const question = QUESTIONS[step]?.(topic.label.toLowerCase()) ?? ''
  const done = step >= QUESTIONS.length

  useEffect(() => {
    if (!voice || done || typeof speechSynthesis === 'undefined') return
    const utterance = new SpeechSynthesisUtterance(question)
    utterance.lang = 'nl-BE'
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
    return () => speechSynthesis.cancel()
  }, [question, voice, done])

  function finish() {
    addInterview(person, topic.id, topic.label, answers.filter(Boolean).join(' '))
    setStep(QUESTIONS.length)
  }

  const answer = answers[step] ?? ''
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Kennisinterview">
      <div className="modal">
        <div className="preview-header">
          <h2>
            🎙 Kennisinterview met {firstName(person)} · {topic.label}
          </h2>
          <button className="close" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>

        {done ? (
          <>
            <p className="interview-done">
              ✓ Vastgelegd. Het transcript is een nieuw signaal: {firstName(person)} is nu aantoonbaar de bron, en de kennis staat niet langer
              alleen in één hoofd.
            </p>
            <div className="modal-actions">
              <button className="primary" onClick={onClose}>
                Sluiten
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="interview-progress">
              Vraag {step + 1} van {QUESTIONS.length} · ± 5 minuten
              <label>
                <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> AI-stem
              </label>
            </div>
            <p className="interview-question">{question}</p>
            <textarea
              value={answer}
              maxLength={MAX_ANSWER_LENGTH}
              rows={4}
              placeholder={`Antwoord van ${firstName(person)} (in productie: spraak, automatisch getranscribeerd)`}
              onChange={(e) => setAnswers((a) => a.map((x, i) => (i === step ? e.target.value.slice(0, MAX_ANSWER_LENGTH) : x)))}
            />
            <div className="modal-actions">
              <button
                className="link-button"
                onClick={() => setAnswers((DEMO_ANSWERS[topic.id] ?? GENERIC_ANSWERS).map((a, i) => answers[i] || a))}
              >
                Demo-antwoorden invullen
              </button>
              <span className="spacer" />
              {step < QUESTIONS.length - 1 ? (
                <button className="primary" disabled={!answer.trim()} onClick={() => setStep(step + 1)}>
                  Volgende vraag
                </button>
              ) : (
                <button className="primary" disabled={!answer.trim()} onClick={finish}>
                  Afronden en vastleggen
                </button>
              )}
            </div>
            <p className="modal-note">In productie stelt een ElevenLabs-stem de vragen; hier leest de browser ze voor.</p>
          </>
        )}
      </div>
    </div>
  )
}
