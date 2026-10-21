import vertexShader from "../shaders/vertex.glsl?raw";
import fragmentShader from "../shaders/fragment.glsl?raw";
import tonemapShader from "../shaders/tonemap.glsl?raw";
import { attachCameraControls, createCamera, moveCamera } from "./camera";

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;

  console.error("Shader compilation failed:", gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
};

const createProgram = (gl: WebGL2RenderingContext, source: string) => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, source);
  if (!vertex || !fragment) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;

  console.error("Shader linking failed:", gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
};

const createRenderTarget = (gl: WebGL2RenderingContext) => {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return { texture, framebuffer };
};

export const createRenderer = (
  canvas: HTMLCanvasElement,
  onStatsChange: (fps: number, samples: number) => void,
) => {
  const gl = canvas.getContext("webgl2");
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
    console.error("WebGL2 with float colour buffers is required.");
    return null;
  }

  const sceneProgram = createProgram(gl, fragmentShader);
  const tonemapProgram = createProgram(gl, tonemapShader);
  if (!sceneProgram || !tonemapProgram) {
    gl.deleteProgram(sceneProgram);
    gl.deleteProgram(tonemapProgram);
    return null;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // Two triangles cover the screen in clip space.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  const sceneUniforms = {
    resolution: gl.getUniformLocation(sceneProgram, "iResolution"),
    position: gl.getUniformLocation(sceneProgram, "iCamPosition"),
    rotation: gl.getUniformLocation(sceneProgram, "iCamRotation"),
    previous: gl.getUniformLocation(sceneProgram, "iPrevAcc"),
    frame: gl.getUniformLocation(sceneProgram, "iFrameIndex"),
    pathTrace: gl.getUniformLocation(sceneProgram, "iPathTrace"),
  };

  const tonemapUniforms = {
    resolution: gl.getUniformLocation(tonemapProgram, "iResolution"),
    scene: gl.getUniformLocation(tonemapProgram, "iScene"),
  };

  const targets = [createRenderTarget(gl), createRenderTarget(gl)];
  const camera = createCamera();
  let width = 0;
  let height = 0;
  let frameIndex = 0;
  let animationFrame = 0;
  let pathTrace = true;
  let fpsFrames = 0;
  let fpsStart = performance.now();

  const reset = () => {
    frameIndex = 0;
  };
  const detachControls = attachCameraControls(camera, reset);

  const dispose = () => {
    cancelAnimationFrame(animationFrame);
    detachControls();
    gl.deleteBuffer(buffer);
    gl.deleteProgram(sceneProgram);
    gl.deleteProgram(tonemapProgram);
    for (const target of targets) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
  };

  const resize = () => {
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const canvasWidth = Math.floor(canvas.clientWidth * pixelRatio);
    const canvasHeight = Math.floor(canvas.clientHeight * pixelRatio);
    if (canvas.width === canvasWidth && canvas.height === canvasHeight && width > 0) return true;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    // Trace at 20 percent resolution in each axis to reduce the ray count.
    width = Math.max(1, Math.floor(canvasWidth * 0.2));
    height = Math.max(1, Math.floor(canvasHeight * 0.2));

    for (const target of targets) {
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error("Render target is incomplete.");
        return false;
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    reset();
    return true;
  };

  const renderScene = () => {
    // Read the previous average from one target while writing to the other.
    const read = targets[frameIndex % 2];
    const write = targets[(frameIndex + 1) % 2];
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(sceneProgram);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.uniform1i(sceneUniforms.previous, 0);
    gl.uniform2f(sceneUniforms.resolution, width, height);
    gl.uniform3fv(sceneUniforms.position, camera.position);
    gl.uniform4fv(sceneUniforms.rotation, camera.rotation);
    gl.uniform1i(sceneUniforms.frame, frameIndex);
    gl.uniform1i(sceneUniforms.pathTrace, Number(pathTrace));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return write.texture;
  };

  const renderToScreen = (texture: WebGLTexture) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(tonemapProgram);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(tonemapUniforms.scene, 0);
    gl.uniform2f(tonemapUniforms.resolution, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const frame = (time: number) => {
    if (!resize()) {
      dispose();
      return;
    }
    if (moveCamera(camera)) reset();
    renderToScreen(renderScene());
    frameIndex++;
    fpsFrames++;
    if (time - fpsStart >= 500) {
      onStatsChange(Math.round(fpsFrames * 1000 / (time - fpsStart)), frameIndex);
      fpsFrames = 0;
      fpsStart = time;
    }
    animationFrame = requestAnimationFrame(frame);
  };

  animationFrame = requestAnimationFrame(frame);

  return {
    dispose,
    togglePathTrace: () => {
      pathTrace = !pathTrace;
      reset();
    },
  };
};
