import { scoreLevel, scoreOf } from '../docScore'

/** Trust score of a document (0–100); the tooltip lists how it was built up. */
export function ScoreBadge({ id }: { id: string }) {
  const s = scoreOf(id)
  if (!s) return null
  const breakdown = s.parts.map((p) => `${p.points >= 0 ? '+' : ''}${p.points}  ${p.label}`).join('\n')
  return (
    <span className={`score-badge ${scoreLevel(s.score)}`} title={`Betrouwbaarheidsscore ${s.score}/100\n${breakdown}`}>
      {s.score}
      <small>/100</small>
    </span>
  )
}

/** Larger block for the side panel: the score and every part of it. */
export function ScoreDetail({ id }: { id: string }) {
  const s = scoreOf(id)
  if (!s) return null
  return (
    <section className="score-detail">
      <div className="score-detail-head">
        <span className={`score-badge large ${scoreLevel(s.score)}`}>
          {s.score}
          <small>/100</small>
        </span>
        <span>
          <strong>Betrouwbaarheidsscore</strong>
          <small>Op basis van status, eigenaar, recentheid en vervangende versies.</small>
        </span>
      </div>
      <ul>
        {s.parts.map((p) => (
          <li key={p.label}>
            <span className={p.points < 0 ? 'score-points minus' : 'score-points'}>
              {p.points >= 0 ? '+' : ''}
              {p.points}
            </span>
            {p.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
