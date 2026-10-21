import vertexShader from "../shaders/vertex.glsl?raw";
import fragmentShader from "../shaders/fragment.glsl?raw";
import tonemapShader from "../shaders/tonemap.glsl?raw";
import { attachCameraControls, createCamera, moveCamera } from "./camera";

export type RenderStats = {
  fps: number;
  samples: number;
  noise: { samples: number; value: number; relative: number }[];
};

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) => {
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
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  return { texture, framebuffer };
};

export const createRenderer = (
  canvas: HTMLCanvasElement,
  onStatsChange: (stats: RenderStats) => void,
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
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
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
  const statsVisible = window.matchMedia("(min-width: 1024px)");
  let width = 0;
  let height = 0;
  let frameIndex = 0;
  let animationFrame = 0;
  let pathTrace = true;
  let fpsFrames = 0;
  let fpsStart = performance.now();
  let noisePixels = new Float32Array(0);
  let noiseHistory: RenderStats["noise"] = [];

  const reset = () => {
    frameIndex = 0;
    noiseHistory = [];
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
    if (
      canvas.width === canvasWidth &&
      canvas.height === canvasHeight &&
      width > 0
    )
      return true;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    // Trace at 20 percent resolution in each axis to reduce the ray count.
    width = Math.max(1, Math.floor(canvasWidth * 0.2));
    height = Math.max(1, Math.floor(canvasHeight * 0.2));
    noisePixels = new Float32Array(width * height * 4);

    for (const target of targets) {
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        width,
        height,
        0,
        gl.RGBA,
        gl.FLOAT,
        null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      if (
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
      ) {
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

  const estimateNoise = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[frameIndex % 2].framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, noisePixels);
    let varianceSum = 0;
    let brightnessSum = 0;
    for (let i = 0; i < noisePixels.length; i += 4) {
      varianceSum += noisePixels[i + 3];
      brightnessSum +=
        noisePixels[i] * 0.2126 +
        noisePixels[i + 1] * 0.7152 +
        noisePixels[i + 2] * 0.0722;
    }
    const value = Math.sqrt(
      varianceSum / (width * height * frameIndex * (frameIndex - 1)),
    );
    const brightness = brightnessSum / (width * height);
    return { value, relative: brightness > 0 ? value / brightness : 0 };
  };

  const reportStats = (time: number) => {
    if (!statsVisible.matches || time - fpsStart < 500) return;

    if (frameIndex > 1) {
      if (noiseHistory.length >= 240) {
        noiseHistory = noiseHistory.filter((_, i) => i % 2 === 0);
      }

      noiseHistory = [
        ...noiseHistory,
        { samples: frameIndex, ...estimateNoise() },
      ];
    }
    onStatsChange({
      fps: Math.round((fpsFrames * 1000) / (time - fpsStart)),
      samples: frameIndex,
      noise: noiseHistory,
    });
    fpsFrames = 0;
    fpsStart = time;
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
    reportStats(time);
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
