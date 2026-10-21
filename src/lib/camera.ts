import { quat, vec3 } from "gl-matrix";

export const createCamera = () => ({
  position: vec3.fromValues(0, 1, 2),
  rotation: quat.create(),
  keys: new Set<string>(),
});

type Camera = ReturnType<typeof createCamera>;

export const moveCamera = (camera: Camera) => {
  const x = Number(camera.keys.has("d")) - Number(camera.keys.has("a"));
  const z = Number(camera.keys.has("s")) - Number(camera.keys.has("w"));
  if (x === 0 && z === 0) return false;

  const direction = vec3.fromValues(x, 0, z);
  vec3.normalize(direction, direction);
  vec3.transformQuat(direction, direction, camera.rotation);
  vec3.scaleAndAdd(camera.position, camera.position, direction, 0.1);
  return true;
};

export const attachCameraControls = (camera: Camera, reset: () => void) => {
  const handleMouseMove = (event: MouseEvent) => {
    if (event.buttons !== 1) return;

    const yaw = quat.setAxisAngle(quat.create(), [0, 1, 0], -event.movementX * 0.005);
    const pitch = quat.setAxisAngle(quat.create(), [1, 0, 0], -event.movementY * 0.005);
    quat.multiply(camera.rotation, yaw, camera.rotation);
    quat.multiply(camera.rotation, camera.rotation, pitch);
    quat.normalize(camera.rotation, camera.rotation);
    reset();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    camera.keys.add(event.key.toLowerCase());
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    camera.keys.delete(event.key.toLowerCase());
  };

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  return () => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  };
};
