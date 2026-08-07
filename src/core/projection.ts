/**
 * Segmented pseudo-3D projection — the technique the 16-bit racers used, not an
 * emulation of it. The road is a ribbon of quads sorted back-to-front; each
 * segment's two edges are projected with the law of similar triangles.
 *
 *   scale = d / z        where d = 1 / tan(fov/2)
 *   screenX = w/2 + scale * cameraX * w/2
 *   screenY = h/2 - scale * cameraY * h/2
 *
 * Reference: Lou's Pseudo-3D page; Jake Gordon's javascript-racer derivation.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** Half-width of the road at this depth, in pixels. */
  w: number;
  scale: number;
}

export interface ProjectedPoint {
  world: Vec3;
  camera: Vec3;
  screen: ScreenPoint;
}

export const makePoint = (x = 0, y = 0, z = 0): ProjectedPoint => ({
  world: { x, y, z },
  camera: { x: 0, y: 0, z: 0 },
  screen: { x: 0, y: 0, w: 0, scale: 0 },
});

/** Camera distance to the projection plane for a given vertical field of view (degrees). */
export const cameraDepthForFov = (fovDegrees: number): number =>
  1 / Math.tan((fovDegrees / 2) * (Math.PI / 180));

/**
 * Translate world -> camera, project onto the normalised plane, then scale to pixels.
 * Mutates `point.camera` and `point.screen` in place: this runs for ~300 segments
 * every frame and allocating four objects per call would thrash the nursery.
 */
export const project = (
  point: ProjectedPoint,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  cameraDepth: number,
  width: number,
  height: number,
  roadWidth: number,
): ProjectedPoint => {
  point.camera.x = point.world.x - cameraX;
  point.camera.y = point.world.y - cameraY;
  point.camera.z = point.world.z - cameraZ;

  // Behind or level with the camera: clamp to a sliver of depth so the projection
  // stays finite. Such segments are culled by the caller, never drawn.
  const z = point.camera.z <= 0 ? 0.0001 : point.camera.z;
  point.screen.scale = cameraDepth / z;

  const halfWidth = width / 2;
  point.screen.x = Math.round(halfWidth + point.screen.scale * point.camera.x * halfWidth);
  point.screen.y = Math.round(height / 2 - point.screen.scale * point.camera.y * (height / 2));
  point.screen.w = Math.round(point.screen.scale * roadWidth * halfWidth);
  return point;
};

/**
 * Exponential distance fog. Indian mornings genuinely have this haze, and it
 * also hides the draw-distance boundary for free.
 */
export const fogFactor = (distance: number, density: number): number =>
  1 / Math.pow(Math.E, (distance * distance * density));

/** Project a sprite anchored to the road plane at a given lateral offset. */
export interface SpritePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export const placeSprite = (
  spriteWidth: number,
  spriteHeight: number,
  scale: number,
  screenX: number,
  screenY: number,
  roadWidth: number,
  canvasWidth: number,
  offsetX: number,
  offsetY: number,
  spriteScale: number,
): SpritePlacement => {
  const destW = spriteWidth * scale * (canvasWidth / 2) * (spriteScale / roadWidth) * roadWidth;
  const destH = spriteHeight * (destW / spriteWidth);
  return {
    x: screenX + destW * offsetX,
    y: screenY + destH * offsetY,
    width: destW,
    height: destH,
    scale,
  };
};
