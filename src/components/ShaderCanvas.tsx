import { useEffect, useRef } from "react";
import vertexShader from "../shaders/vertex.glsl?raw";
import fragmentShader from "../shaders/fragment.glsl?raw";
import tonemapShader from "../shaders/tonemap.glsl?raw";
import { quat, vec2, vec3 } from "gl-matrix";

const secondsSinceStart = () => {
  return performance.now() / 1000;
};

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string
) => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    console.error("could not compile shader : ", log);
    return null;
  }
  return shader;
};

const createProgram = (
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string
) => {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (vs === null || fs === null) {
    console.error("shader compilation failed");
    return null;
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    console.error("could not link program : ", log);
    return null;
  }

  // shaders can be deleted after linking
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
};

const createAccTexture = (
  gl: WebGL2RenderingContext,
  width: number,
  height: number
) => {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA16F,
    width,
    height,
    0,
    gl.RGBA,
    gl.HALF_FLOAT,
    null
  );

  return tex;
};

const createFbo = (gl: WebGL2RenderingContext, tex: WebGLTexture) => {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0
  );
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error("incomplete framebuffer");
    return null;
  }

  return fbo;
};

const createTexFboPair = (
  gl: WebGL2RenderingContext,
  width: number,
  height: number
) => {
  const tex = createAccTexture(gl, width, height);
  const fbo = createFbo(gl, tex);
  return { tex, fbo };
};

const clearFbo = (gl: WebGL2RenderingContext, fbo: WebGLFramebuffer) => {
  gl.clearColor(0, 0, 0, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.clear(gl.COLOR_BUFFER_BIT);
};

const mouseMoveSens = vec2.fromValues(0.005, 0.005);
const moveSpeed = 0.1;
const worldRight = vec3.fromValues(1, 0, 0);
const worldForward = vec3.fromValues(0, 0, -1);

// TODO : Get movement and rotation working on mobile
const GetDeltaMovement = (keysPressed: Set<string>, rotation: quat) => {
  const moveDir = vec3.create();
  if (keysPressed.size > 0) {
    const localForward = vec3.create();
    vec3.transformQuat(localForward, worldForward, rotation);
    vec3.normalize(localForward, localForward);

    const localRight = vec3.create();
    vec3.transformQuat(localRight, worldRight, rotation);
    vec3.normalize(localRight, localRight);

    if (keysPressed.has("w")) {
      vec3.add(moveDir, moveDir, localForward);
    }
    if (keysPressed.has("s")) {
      vec3.sub(moveDir, moveDir, localForward);
    }
    if (keysPressed.has("a")) {
      vec3.sub(moveDir, moveDir, localRight);
    }
    if (keysPressed.has("d")) {
      vec3.add(moveDir, moveDir, localRight);
    }

    vec3.normalize(moveDir, moveDir);
    vec3.scale(moveDir, moveDir, moveSpeed);
    return moveDir;
  }
};

const ShaderCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camPos = useRef<vec3>(vec3.fromValues(0, 1, 2));
  const camRot = useRef<quat>(quat.create());
  const frameIdx = useRef<number>(0);
  const renderScale = useRef<number>(0.2);
  const keysPressed = useRef<Set<string>>(new Set());
  const togglePathTrace = useRef<boolean>(true);

  const getRenderSize = () => {
    const canvas = canvasRef.current!;
    return [
      Math.floor(canvas.width * renderScale.current),
      Math.floor(canvas.height * renderScale.current),
    ];
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (e.buttons !== 1) return; // only rotate on left-click drag
    const deltaX = e.movementX;
    const deltaY = e.movementY;
    const yaw = -deltaX * mouseMoveSens[0];
    const pitch = -deltaY * mouseMoveSens[1];

    const qYaw = quat.create();
    quat.setAxisAngle(qYaw, [0, 1, 0], yaw);
    const qPitch = quat.create();
    quat.setAxisAngle(qPitch, [1, 0, 0], pitch);

    quat.multiply(camRot.current, qYaw, camRot.current);
    quat.multiply(camRot.current, camRot.current, qPitch);
    quat.normalize(camRot.current, camRot.current);
    frameIdx.current = 0; // reset accumulation
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    keysPressed.current.add(e.key.toLowerCase());
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    keysPressed.current.delete(e.key.toLowerCase());
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2");

    if (gl === null) {
      console.error("WebGL2 not supported, cannot display awesome bg shader.");
      return;
    }

    const ext = gl.getExtension("EXT_color_buffer_float");
    if (ext === null) {
      console.error("Requires EXT_color_buffer_float extension for bg.");
      return;
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    // Compile and link
    const accProgram = createProgram(gl, vertexShader, fragmentShader);
    const tonemapProgram = createProgram(gl, vertexShader, tonemapShader);
    if (accProgram === null || tonemapProgram === null) {
      console.error("failed to create shader programs");
      return;
    }

    // full-screen quad drawn as two triangles
    const quadVboData = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);

    // Attribute setup
    const quadVboId = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVboId);
    gl.bufferData(gl.ARRAY_BUFFER, quadVboData, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(accProgram, "aPosition");
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posLoc);

    // Uniform locations
    const iSceneResLoc = gl.getUniformLocation(accProgram, "iResolution");
    const iTimeLoc = gl.getUniformLocation(accProgram, "iTime");
    const iCamPositionLoc = gl.getUniformLocation(accProgram, "iCamPosition");
    const iCamRotationLoc = gl.getUniformLocation(accProgram, "iCamRotation");
    const iPrevAccLoc = gl.getUniformLocation(accProgram, "iPrevAcc");
    const iFrameIndexLoc = gl.getUniformLocation(accProgram, "iFrameIndex");
    const iPathTraceLoc = gl.getUniformLocation(accProgram, "iPathTrace");

    const iTonemapResLoc = gl.getUniformLocation(tonemapProgram, "iResolution");
    const iTonemapSceneLoc = gl.getUniformLocation(tonemapProgram, "iScene");
    const iGammaLoc = gl.getUniformLocation(tonemapProgram, "iGamma");
    const iExposureLoc = gl.getUniformLocation(tonemapProgram, "iExposure");

    // Create FBOs and Textures for accumulation (ping-ponging)
    const [renderWidth, renderHeight] = getRenderSize();

    let { tex: accTex1, fbo: maybeFbo1 } = createTexFboPair(
      gl,
      renderWidth,
      renderHeight
    );
    let { tex: accTex2, fbo: maybeFbo2 } = createTexFboPair(
      gl,
      renderWidth,
      renderHeight
    );

    if (!maybeFbo1 || !maybeFbo2) {
      console.error("failed to create fbos");
      return;
    }
    let fbo1: WebGLFramebuffer = maybeFbo1;
    let fbo2: WebGLFramebuffer = maybeFbo2;

    // Initialize textures to black
    clearFbo(gl, fbo1);
    clearFbo(gl, fbo2);

    const resize = () => {
      if (gl === null) return;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;

        const [renderWidth, renderHeight] = getRenderSize();

        // Recreate textures and FBOs on resize
        gl.deleteTexture(accTex1);
        gl.deleteFramebuffer(fbo1);
        gl.deleteTexture(accTex2);
        gl.deleteFramebuffer(fbo2);

        let pair1 = createTexFboPair(gl, renderWidth, renderHeight);
        let pair2 = createTexFboPair(gl, renderWidth, renderHeight);

        accTex1 = pair1.tex;
        accTex2 = pair2.tex;

        if (!pair1.fbo || !pair2.fbo) {
          console.error("failed to resize fbos");
          return;
        }

        fbo1 = pair1.fbo;
        fbo2 = pair2.fbo;

        // Re-Initialize textures to black
        clearFbo(gl, fbo1);
        clearFbo(gl, fbo2);

        frameIdx.current = 0;
      }
    };

    let currFrame: number;
    const prevCamPos = vec3.create();
    const prevCamRot = quat.create();

    const frame = () => {
      if (gl === null) return;
      resize();
      const [renderWidth, renderHeight] = getRenderSize();

      // Handle movement
      const deltaMove = GetDeltaMovement(keysPressed.current, camRot.current);
      if (deltaMove) {
        vec3.add(camPos.current, camPos.current, deltaMove);
        frameIdx.current = 0; // reset accumulation
      }

      // If camera transform changed, reset accumulation
      if (
        !vec3.equals(prevCamPos, camPos.current) ||
        !quat.equals(prevCamRot, camRot.current)
      ) {
        frameIdx.current = 0;
        vec3.copy(prevCamPos, camPos.current);
        quat.copy(prevCamRot, camRot.current);
      }

      // Ping-pong FBOs
      const writeFbo = frameIdx.current % 2 === 0 ? fbo2 : fbo1;
      const readTex = frameIdx.current % 2 === 0 ? accTex1 : accTex2;
      const writeTex = frameIdx.current % 2 === 0 ? accTex2 : accTex1;

      // Pass 1 : Accumulation
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
      gl.viewport(0, 0, renderWidth, renderHeight);
      gl.useProgram(accProgram);

      // Tell GPU to read from texture unit 0 for acc
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.uniform1i(iPrevAccLoc, 0);

      gl.uniform2f(iSceneResLoc, renderWidth, renderHeight);
      gl.uniform1f(iTimeLoc, secondsSinceStart());
      gl.uniform3fv(iCamPositionLoc, camPos.current);
      gl.uniform4fv(iCamRotationLoc, camRot.current);
      gl.uniform1i(iFrameIndexLoc, frameIdx.current);
      gl.uniform1i(iPathTraceLoc, togglePathTrace.current ? 1 : 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 2 : Tonemap to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(tonemapProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, writeTex);
      gl.uniform1i(iTonemapSceneLoc, 0);

      gl.uniform2f(iTonemapResLoc, canvas.width, canvas.height);
      gl.uniform1f(iGammaLoc, 2.2);
      gl.uniform1f(iExposureLoc, 1.0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      frameIdx.current++;
      currFrame = requestAnimationFrame(frame);
    };

    // start loop; keep track of frame for deleting later
    currFrame = requestAnimationFrame(frame);

    // cleanup
    return () => {
      cancelAnimationFrame(currFrame);
      gl.deleteBuffer(quadVboId);
      gl.deleteProgram(accProgram);
      gl.deleteProgram(tonemapProgram);
      gl.deleteFramebuffer(fbo1);
      gl.deleteTexture(accTex1);
      gl.deleteFramebuffer(fbo2);
      gl.deleteTexture(accTex2);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="fixed h-full w-full" />
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2">
        <button
          onClick={() => {
            togglePathTrace.current = !togglePathTrace.current;
            frameIdx.current = 0; // reset accumulation
          }}
          // simple mono font text with underline button and finger
          className="
          font-mono font-bold 
          text-white hover:text-black
          bg-black hover:bg-neutral-100
          hover:underline hover:cursor-pointer 
          px-1 
          "
        >
          Toggle Path Trace
        </button>
      </div>
    </>
  );
};

export default ShaderCanvas;
