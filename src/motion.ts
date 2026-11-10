import type { EntityMotion, MotionEasing } from './engine/index.ts'

/** The single place to change the shipped movement feel. Times are milliseconds. */
export const defaultMotionSettings = {
  movementMs: 110,
  doorMs: 110,
  clockMs: 40,
  finishWithinMs: 16,
  easing: 'ease-out-quad' as MotionEasing,
  stretch: 0.3,
  squash: 0.2,
}

/** Two smooth lobes: stretch during travel, compress near arrival, recover at the end. */
export function playerScale(motion: EntityMotion | undefined, settings: Pick<typeof defaultMotionSettings, 'stretch' | 'squash'> = defaultMotionSettings) {
  if (!motion) return { x: 1, y: 1 }
  const p = Math.max(0, Math.min(1, motion.progress))
  if (p === 0 || p === 1) return { x: 1, y: 1 }
  const split = 0.65
  const amount = p < split
    ? settings.stretch * Math.sin(Math.PI * p / split) ** 2
    : -settings.squash * Math.sin(Math.PI * (p - split) / (1 - split)) ** 2
  const along = 1 + amount
  const across = 1 / along
  return motion.from.x !== motion.to.x ? { x: along, y: across } : { x: across, y: along }
}
