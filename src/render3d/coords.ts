// Sim world is mm, top-down, +x East, +y South. Three.js is meters, Y-up.
// Map world (x, y) -> three (x/1000, 0, y/1000); world theta -> rotation.y = -theta
// (a mesh whose local +X is "forward" then points along (cos theta, 0, sin theta)).
export const MM_TO_M = 1 / 1000;

export function worldToThree(x: number, y: number): [number, number, number] {
  return [x * MM_TO_M, 0, y * MM_TO_M];
}

export function headingToThreeY(theta: number): number {
  return -theta;
}
