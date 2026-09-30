import { useState } from 'react'
import { castVote, myVote, useVoteSummaries, VOTE_REASONS, VoteError, type VoteReason } from '../votes'

const SIMULATED_NOTE = 'Bevat gesimuleerde demostemmen (data/votes_seed.json), niet van echte gebruikers.'

/** "Was dit document nuttig voor '<zoekterm>'?" (CLAUDE.md, section 12, M4e). */
export function VoteBox({ docId, query }: { docId: string; query: string }) {
  const summary = useVoteSummaries(query).get(docId)
  const mine = myVote(query, docId)
  const [error, setError] = useState<string | null>(null)

  function vote(value: 1 | -1, reason: VoteReason | null = null) {
    try {
      castVote(query, docId, value, reason)
      setError(null)
    } catch (e) {
      setError(e instanceof VoteError ? e.message : 'Stemmen lukt niet.')
    }
  }

  const topReasons = Object.entries(summary?.reasons ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3) as [VoteReason, number][]

  return (
    <section className="vote-box">
      <div className="vote-question">
        Was dit document nuttig voor ‘<span className="vote-query">{query}</span>’?
      </div>
      <div className="vote-buttons">
        <button className={mine?.vote === 1 ? 'active' : ''} aria-pressed={mine?.vote === 1} onClick={() => vote(1)}>
          👍 Nuttig
        </button>
        <button className={mine?.vote === -1 ? 'active' : ''} aria-pressed={mine?.vote === -1} onClick={() => vote(-1, mine?.reason ?? null)}>
          👎 Niet nuttig
        </button>
      </div>
      {mine?.vote === -1 && (
        <div className="reason-chips" role="group" aria-label="Reden (optioneel)">
          {(Object.keys(VOTE_REASONS) as VoteReason[]).map((r) => (
            <button key={r} className={mine.reason === r ? 'active' : ''} aria-pressed={mine.reason === r} onClick={() => vote(-1, mine.reason === r ? null : r)}>
              {VOTE_REASONS[r]}
            </button>
          ))}
        </div>
      )}
      {error && <div className="warning">{error}</div>}

      {summary && (
        <div className="vote-summary" title={summary.hasSimulated ? SIMULATED_NOTE : undefined}>
          <div>
            Stemmen voor deze zoekopdracht: 👍 {summary.up} · 👎 {summary.down}
            {summary.hasSimulated && <span className="simulated-mark"> (incl. gesimuleerd)</span>}
          </div>
          <div className="vote-usefulness">Nuttigheidsscore: {Math.round(summary.usefulness * 100)}%</div>
          {topReasons.length > 0 && (
            <div className="vote-reasons">
              Redenen bij 👎: {topReasons.map(([r, n]) => `${VOTE_REASONS[r]} (${n})`).join(', ')}
            </div>
          )}
          {summary.recentNegative > 0 && (
            <div className={summary.recentlyRejected ? 'warning' : 'vote-reasons'}>
              {summary.recentNegative} {summary.recentNegative === 1 ? 'collega meldde' : "collega's meldden"} recent dat dit verouderd is of niet klopt
            </div>
          )}
        </div>
      )}
      <p className="vote-note">Nuttig betekent niet correct: stemmen veranderen de aanbeveling niet.</p>
    </section>
  )
}
