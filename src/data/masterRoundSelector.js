import { getMasterPriority } from './masterPriorityEngine.js'

const getTraitStrengthBonus = (pokemon) => {
  if (!pokemon.hasTrait) {
    return 0
  }

  const priority = pokemon.priority

  if (priority === 0) {
    return 15
  }

  if (priority === 1) {
    return 12
  }

  if (priority === 2) {
    return 8
  }

  if (priority >= 3 && priority <= 5) {
    return 5
  }

  if (priority >= 6 && priority <= 10) {
    return 3
  }

  if (priority === 11) {
    return 2
  }

  return 0
}

// This file only selects Master Round choices.
// It does not reveal Pokemon, save to Firestore, update UI, calculate battle
// results, or choose a Pokemon for the player.

export const calculateMasterRating = (pokemon) => {
  const traitStrengthBonus = getTraitStrengthBonus(pokemon)
  const snorlaxDangerBonus = pokemon.name === 'Snorlax' ? 20 : 0

  return pokemon.score + traitStrengthBonus + snorlaxDangerBonus
}

const compareMasterCandidates = (pokemonA, pokemonB) => {
  const ratingDifference =
    calculateMasterRating(pokemonB) - calculateMasterRating(pokemonA)

  if (ratingDifference !== 0) {
    return ratingDifference
  }

  const priorityDifference =
    getMasterPriority(pokemonA) - getMasterPriority(pokemonB)

  if (priorityDifference !== 0) {
    return priorityDifference
  }

  const scoreDifference = pokemonB.score - pokemonA.score

  if (scoreDifference !== 0) {
    return scoreDifference
  }

  return pokemonA.name.localeCompare(pokemonB.name)
}

const getPokemonKey = (pokemon) =>
  pokemon.id === undefined ? pokemon.name : pokemon.id

export const selectMasterRoundCandidates = (team = []) => {
  const uniqueTeam = [
    ...new Map(
      team.map((pokemon) => [getPokemonKey(pokemon), pokemon]),
    ).values(),
  ]

  if (uniqueTeam.length < 3) {
    return [...uniqueTeam].sort(compareMasterCandidates)
  }

  const rankedTeam = [...uniqueTeam].sort(compareMasterCandidates)
  const snorlax = rankedTeam.find((pokemon) => pokemon.name === 'Snorlax')

  if (!snorlax) {
    return rankedTeam.slice(0, 3)
  }

  const candidates = [
    snorlax,
    ...rankedTeam.filter((pokemon) => pokemon !== snorlax).slice(0, 2),
  ]

  return candidates.sort(compareMasterCandidates)
}

export const shuffleMasterRoundPokeballs = (
  candidates,
  randomFn = Math.random,
) => {
  const shuffled = [...candidates]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(randomFn() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ]
  }

  return shuffled
}

export const createMasterRoundOptions = (
  team,
  randomFn = Math.random,
) => {
  const candidates = selectMasterRoundCandidates(team)

  return {
    candidates,
    hiddenOptions: shuffleMasterRoundPokeballs(candidates, randomFn),
  }
}

// Example: A team with Snorlax, Arceus, Garchomp, Lucario, Charizard, and
// Umbreon must include Snorlax.
//
// Example: A team without Snorlax selects the three highest Master Ratings.
