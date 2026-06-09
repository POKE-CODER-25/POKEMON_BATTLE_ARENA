import { calculateRawTypeBonus } from './typeChart.js'

export const TYPE_BONUS_EXAMPLES = [
  {
    name: 'Sceptile vs Swampert',
    attackerTypes: ['Grass'],
    defenderTypes: ['Water', 'Ground'],
    expectedBonus: 10,
    explanation:
      'Grass is effective against both Water and Ground, so bonus is +10.',
  },
  {
    name: 'Charizard vs Venusaur',
    attackerTypes: ['Fire', 'Flying'],
    defenderTypes: ['Grass', 'Poison'],
    expectedBonus: 5,
    explanation:
      'Fire and Flying both target Grass, but the same defender type cannot be counted twice, so bonus is +5.',
  },
  {
    name: 'Charizard vs Mamoswine',
    attackerTypes: ['Fire', 'Flying'],
    defenderTypes: ['Ice', 'Ground'],
    expectedBonus: 0,
    explanation:
      'Fire is strong against Ice, but Ground interaction balances the matchup according to our net type rules, so final bonus is 0.',
  },
  {
    name: 'Lucario vs Tyranitar',
    attackerTypes: ['Fighting', 'Steel'],
    defenderTypes: ['Rock', 'Dark'],
    expectedBonus: 10,
    explanation:
      'Fighting is effective against both Rock and Dark, so bonus is +10.',
  },
  {
    name: 'Gyarados vs Talonflame',
    attackerTypes: ['Water', 'Flying'],
    defenderTypes: ['Fire', 'Flying'],
    expectedBonus: 5,
    explanation: 'Water is effective against Fire, so bonus is +5.',
  },
  {
    name: 'Articuno vs Garchomp',
    attackerTypes: ['Ice', 'Flying'],
    defenderTypes: ['Dragon', 'Ground'],
    expectedBonus: 10,
    explanation:
      'Ice is effective against both Dragon and Ground, so bonus is +10.',
  },
]

export const runTypeBonusExampleChecks = () =>
  TYPE_BONUS_EXAMPLES.map(
    ({
      name,
      attackerTypes,
      defenderTypes,
      expectedBonus,
      explanation,
    }) => {
      const actualBonus = calculateRawTypeBonus(
        attackerTypes,
        defenderTypes,
      )

      return {
        name,
        expectedBonus,
        actualBonus,
        passed: actualBonus === expectedBonus,
        explanation,
      }
    },
  )
