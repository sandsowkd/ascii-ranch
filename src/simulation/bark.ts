export const BARK_TRAVEL_TIME = 0.55;
export const BARK_FADE_TIME = 0.12;
export const BARK_LIFETIME = BARK_TRAVEL_TIME + BARK_FADE_TIME;

export interface Bark {
  x: number; y: number; age: number; startRadius: number; maxRadius: number;
  hitIds: Set<number>;
}

export function createBark(x: number, y: number, width: number, height: number, scale: number): Bark {
  return { x, y, age: 0, startRadius: 46 * scale,
    maxRadius: Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 12 * scale, hitIds: new Set() };
}

/** Rendering and animal reactions use exactly the same outward-moving front. */
export function barkRadius(bark: Bark, age = bark.age) {
  return bark.startRadius + (bark.maxRadius - bark.startRadius) * Math.min(1, Math.max(0, age) / BARK_TRAVEL_TIME);
}

export function barkTouches(bark: Bark, x: number, y: number, bodyRadius: number, dt: number) {
  if (bark.age > BARK_TRAVEL_TIME + dt) return false;
  const distance = Math.hypot(x - bark.x, y - bark.y);
  return distance - bodyRadius <= barkRadius(bark) &&
    (bark.age <= dt || distance + bodyRadius >= barkRadius(bark, bark.age - dt));
}
