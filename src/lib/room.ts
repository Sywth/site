import type { ReadonlyVec3 } from "gl-matrix";

export const roomBounds = {
  left: -6,
  right: 6,
  floor: -1,
  ceiling: 5,
  back: -10,
} as const;

export const isOutsideRoom = (position: ReadonlyVec3) =>
  position[0] < roomBounds.left ||
  position[0] > roomBounds.right ||
  position[1] < roomBounds.floor ||
  position[1] > roomBounds.ceiling ||
  position[2] < roomBounds.back;
