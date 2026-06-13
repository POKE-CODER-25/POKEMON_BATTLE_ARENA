const ANALYSIS_CARD_TYPES = [
  {
    id: 'base',
    label: 'Base Power',
    icon: '\u2694',
    matches: (log) => /^Base score:/i.test(log),
  },
  {
    id: 'transformation',
    label: 'Transformation',
    icon: '\u2726',
    matches: (log) =>
      /mega evol|ash greninja|battle bond|transformed form/i.test(log),
  },
  {
    id: 'type',
    label: 'Type Advantage',
    icon: '\u25c6',
    matches: (log) => /type (bonus|advantage|effect)/i.test(log),
  },
  {
    id: 'trait',
    label: 'Trait Bonus',
    icon: '\u2605',
    matches: (log) =>
      /trait|aura|awakening|blaze|torrent|growth|determination|killer|wish|warp|priority/i.test(
        log,
      ),
  },
  {
    id: 'battlefield',
    label: 'Arena Effect',
    icon: '\u25ce',
    matches: (log) => /battlefield|arena|field|weather|terrain/i.test(log),
  },
]

function getAnalysisValue(log) {
  const valueMatch = log.match(
    /([+-]\d+|\d+)(?:\s*\(protected\))?\.?$/i,
  )

  return valueMatch?.[1] ?? ''
}

export function createBattleAnalysisCards(logs = []) {
  const uniqueLogs = [...new Set(logs.filter(Boolean))]
  const assignedLogs = new Set()
  const cards = ANALYSIS_CARD_TYPES.map((type) => {
    const entries = uniqueLogs
      .filter((log) => type.matches(log))
      .map((log) => {
        assignedLogs.add(log)

        return {
          text: log,
          value: getAnalysisValue(log),
        }
      })

    return entries.length > 0 ? { ...type, entries } : null
  }).filter(Boolean)
  const otherEntries = uniqueLogs
    .filter(
      (log) =>
        !assignedLogs.has(log) &&
        !/\bwins?\b|round draw|higher final score/i.test(log),
    )
    .slice(0, 3)
    .map((log) => ({
      text: log,
      value: getAnalysisValue(log),
    }))

  if (otherEntries.length > 0) {
    cards.push({
      id: 'battle',
      label: 'Battle Effect',
      icon: '\u2727',
      entries: otherEntries,
    })
  }

  return cards.slice(0, 6)
}
