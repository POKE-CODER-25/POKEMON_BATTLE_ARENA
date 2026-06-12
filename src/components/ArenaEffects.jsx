export const ENABLE_ARENA_EFFECTS = true

function EffectParticles({ count = 8 }) {
  return Array.from({ length: count }, (_, index) => (
    <i key={index} />
  ))
}

function InfernoEffects() {
  return (
    <div className="arena-effects arena-effects-inferno" aria-hidden="true">
      <span className="arena-effect-glow" />
      <span className="arena-effect-shimmer" />
      <span className="arena-effect-particles">
        <EffectParticles count={9} />
      </span>
    </div>
  )
}

function ForestEffects() {
  return (
    <div className="arena-effects arena-effects-forest" aria-hidden="true">
      <span className="arena-effect-glow" />
      <span className="arena-effect-shimmer" />
      <span className="arena-effect-particles">
        <EffectParticles count={8} />
      </span>
    </div>
  )
}

function CrystalEffects() {
  return (
    <div className="arena-effects arena-effects-crystal" aria-hidden="true">
      <span className="arena-effect-glow" />
      <span className="arena-effect-shimmer" />
      <span className="arena-effect-particles">
        <EffectParticles count={8} />
      </span>
    </div>
  )
}

function CelestialEffects() {
  return (
    <div className="arena-effects arena-effects-celestial" aria-hidden="true">
      <span className="arena-effect-glow" />
      <span className="arena-effect-shimmer" />
      <span className="arena-effect-particles">
        <EffectParticles count={8} />
      </span>
    </div>
  )
}

function StadiumEffects() {
  return (
    <div className="arena-effects arena-effects-stadium" aria-hidden="true">
      <span className="arena-effect-glow" />
      <span className="arena-effect-shimmer" />
      <span className="arena-effect-particles">
        <EffectParticles count={6} />
      </span>
    </div>
  )
}

const ARENA_EFFECT_COMPONENTS = {
  'inferno-colosseum': InfernoEffects,
  'moonlit-forest-shrine': ForestEffects,
  'crystal-cavern': CrystalEffects,
  'celestial-sky-temple': CelestialEffects,
  'royal-champion-stadium': StadiumEffects,
}

function ArenaEffects({ arenaId }) {
  if (!ENABLE_ARENA_EFFECTS) {
    return null
  }

  const EffectComponent = ARENA_EFFECT_COMPONENTS[arenaId]

  return EffectComponent ? <EffectComponent /> : null
}

export default ArenaEffects
