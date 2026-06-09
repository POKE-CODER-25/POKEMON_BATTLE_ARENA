import {
  fanFavouriteAPokemon,
  fanFavouriteBPokemon,
  legendaryPokemon,
  pseudoPokemon,
  starterPokemon,
  supportPokemon,
} from './pokemonBattleData.js'
import { POKEMON_CATEGORIES } from './battleConstants.js'

const artwork = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`

const toDraftPokemon = (pokemon, roundPool) => ({
  ...pokemon,
  roundPool,
  sprite: artwork(pokemon.id),
  powerScore: pokemon.score,
})

const createDraftPool = (pokemon, roundPool) =>
  pokemon.map((entry) => toDraftPokemon(entry, roundPool))

export const starterPools = {
  Fire: createDraftPool(
    starterPokemon.filter((pokemon) => pokemon.types[0] === 'Fire'),
    'Fire Starter',
  ),
  Water: createDraftPool(
    starterPokemon.filter((pokemon) => pokemon.types[0] === 'Water'),
    'Water Starter',
  ),
  Grass: createDraftPool(
    starterPokemon.filter((pokemon) => pokemon.types[0] === 'Grass'),
    'Grass Starter',
  ),
}

export const supportPool = createDraftPool(supportPokemon, 'Support')

export const fanFavouriteAPool = createDraftPool(
  fanFavouriteAPokemon,
  'Fan Favourite A',
)

export const fanFavouriteBPool = createDraftPool(
  fanFavouriteBPokemon,
  'Fan Favourite B',
)

export const pseudoLegendaryPool = createDraftPool(
  pseudoPokemon,
  'Pseudo Legendaries',
)

export const legendaryPools = {
  S: createDraftPool(
    legendaryPokemon.filter(
      (pokemon) => pokemon.category === POKEMON_CATEGORIES.S_LEGEND,
    ),
    'Legendary S',
  ),
  A: createDraftPool(
    legendaryPokemon.filter(
      (pokemon) => pokemon.category === POKEMON_CATEGORIES.A_LEGEND,
    ),
    'Legendary A',
  ),
  B: createDraftPool(
    legendaryPokemon.filter(
      (pokemon) => pokemon.category === POKEMON_CATEGORIES.B_LEGEND,
    ),
    'Legendary B',
  ),
}

export const draftPools = {
  starters: starterPools,
  support: supportPool,
  fanFavouriteA: fanFavouriteAPool,
  pseudoLegendaries: pseudoLegendaryPool,
  legendaries: legendaryPools,
  fanFavouriteB: fanFavouriteBPool,
}
