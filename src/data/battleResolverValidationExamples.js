import { resolveBattleRound } from './battleRoundResolver.js'
import { allBattlePokemon } from './pokemonBattleData.js'
import { createMasterRoundOptions } from './masterRoundSelector.js'

// These are developer validation helpers only.
// They are not production battle flow and they are not UI tests.

export const findPokemon = (name) => {
  const pokemon = allBattlePokemon.find((entry) => entry.name === name)

  if (!pokemon) {
    throw new Error(`Battle validation Pokemon not found: ${name}`)
  }

  return pokemon
}

export const always = (value) => () => value

export const BATTLE_VALIDATION_EXAMPLES = [
  {
    name: 'Lucario vs Gengar',
    description:
      'Lucario receives protected Aura +2, which Gengar cannot steal.',
    run: () =>
      resolveBattleRound({
        pokemonA: findPokemon('Lucario'),
        pokemonB: findPokemon('Gengar'),
        roundNumber: 1,
        randomFn: always(0.99),
      }),
  },
  {
    name: 'Regigigas Round 1',
    description: 'Regigigas receives the Round 1 Slow Start penalty of -5.',
    run: () =>
      resolveBattleRound({
        pokemonA: findPokemon('Regigigas'),
        pokemonB: findPokemon('Pikachu'),
        roundNumber: 1,
        randomFn: always(0.99),
      }),
  },
  {
    name: 'Regigigas Master Round',
    description:
      'Regigigas receives protected Titan Awakening +15 and reaches 103 before type effects.',
    run: () =>
      resolveBattleRound({
        pokemonA: findPokemon('Regigigas'),
        pokemonB: findPokemon('Arceus'),
        roundNumber: 7,
        isMasterRound: true,
        randomFn: always(0.99),
      }),
  },
  {
    name: 'Snorlax Normal Awakening Success',
    description: 'Snorlax awakens in a normal round and gains protected +20.',
    run: () =>
      resolveBattleRound({
        pokemonA: findPokemon('Snorlax'),
        pokemonB: findPokemon('Arceus'),
        roundNumber: 3,
        randomFn: always(0.01),
      }),
  },
  {
    name: 'Snorlax Master Round Awakening Success',
    description: 'Snorlax awakens in the Master Round and gains protected +25.',
    run: () =>
      resolveBattleRound({
        pokemonA: findPokemon('Snorlax'),
        pokemonB: findPokemon('Arceus'),
        roundNumber: 7,
        isMasterRound: true,
        randomFn: always(0.01),
      }),
  },
  {
    name: 'Moltres vs Ho-Oh Comeback Chain',
    description:
      'Moltres and Ho-Oh may each activate their comeback trait once without looping.',
    run: () =>
      resolveBattleRound({
        pokemonA: findPokemon('Moltres'),
        pokemonB: findPokemon('Ho-Oh'),
        roundNumber: 2,
        randomFn: always(0.01),
      }),
  },
  {
    name: 'Dialga Time Warp',
    description:
      'A losing Dialga successfully reverses the battle with Time Warp.',
    run: () =>
      resolveBattleRound({
        pokemonA: findPokemon('Dialga'),
        pokemonB: findPokemon('Arceus'),
        roundNumber: 4,
        randomFn: always(0.01),
      }),
  },
  {
    name: 'Master Round Tie True Warriors',
    description:
      'Rayquaza and Necrozma remain tied when God Killer fails, producing True Warriors.',
    run: () =>
      resolveBattleRound({
        pokemonA: findPokemon('Rayquaza'),
        pokemonB: findPokemon('Necrozma'),
        roundNumber: 7,
        isMasterRound: true,
        randomFn: always(0.99),
      }),
  },
  {
    name: 'Master Round Priority Reference',
    description:
      'Garchomp versus Lucario documents that a tied score would favor Pseudo over Fan Favourite A.',
    run: () =>
      resolveBattleRound({
        pokemonA: findPokemon('Garchomp'),
        pokemonB: findPokemon('Lucario'),
        roundNumber: 7,
        isMasterRound: true,
        randomFn: always(0.99),
      }),
  },
  {
    name: 'Master Round Selector with Snorlax',
    description:
      'Master Round candidates must include Snorlax when Snorlax is on the drafted team.',
    run: () =>
      createMasterRoundOptions(
        [
          findPokemon('Snorlax'),
          findPokemon('Arceus'),
          findPokemon('Garchomp'),
          findPokemon('Lucario'),
          findPokemon('Charizard'),
          findPokemon('Umbreon'),
        ],
        always(0.99),
      ),
  },
]

export const runBattleValidationExamples = () =>
  BATTLE_VALIDATION_EXAMPLES.map((example) => ({
    name: example.name,
    description: example.description,
    result: example.run(),
  }))
