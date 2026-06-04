// Live first-person pose, written every frame by the camera system and read by
// the minimap's own animation loop. Kept out of the React store so we don't
// trigger 60fps re-renders.
export const fpLive = { x: 0, z: 0, yaw: 0 };
