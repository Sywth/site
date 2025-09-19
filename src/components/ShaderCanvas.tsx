import { useEffect, useRef, useState } from "react";
import vertexShader from "../shaders/vertex.glsl?raw";
import fragmentShader from "../shaders/fragment.glsl?raw";
import tonemapShader from "../shaders/tonemap.glsl?raw";
import { quat, vec3 } from "gl-matrix";

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

const ShaderCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraPosition, setCameraPosition] = useState(() => vec3.create());
  const [cameraRotation, setCameraRotation] = useState(() => quat.create());

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2");

    if (gl === null) {
      console.error("WebGL2 not supported, cannot display awesome bg shader.");
      return;
    }

    // Compile and link
    let sceneProgram = createProgram(gl, vertexShader, fragmentShader);
    if (sceneProgram === null) {
      console.error("failed to create scene shader program");
      return;
    }

    // TODO : Finish this; we need to use this with a FBO and do tonemapping as a post-process
    // 1. We need to average out the frames over time
    // 2. Tonemapping as a post-process
    // 3. Reset the accumulation when the camera instrinsics change
    let tonemapProgram = createProgram(gl, vertexShader, tonemapShader);
    if (tonemapProgram === null) {
      console.error("failed to create tonemap shader program");
      return;
    }

    // full-screen quad drawn as two triangles
    const quadVboData = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);

    const quadVboId = gl.createBuffer();

    // Attribute setup
    const bindAttribs = (program: WebGLProgram) => {
      const posLoc = gl.getAttribLocation(program, "aPosition");
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVboId);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    };

    gl.bindBuffer(gl.ARRAY_BUFFER, quadVboId);
    gl.bufferData(gl.ARRAY_BUFFER, quadVboData, gl.STATIC_DRAW);
    bindAttribs(sceneProgram);

    // While its bound, upload data
    gl.bufferData(gl.ARRAY_BUFFER, quadVboData, gl.STATIC_DRAW);

    // FBO setup
    const fbo = gl.createFramebuffer();
    const sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const resize = () => {
      if (gl === null) return;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);

        // Resize FBO attachments
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null
        );

        gl.renderbufferStorage(
          gl.RENDERBUFFER,
          gl.DEPTH_COMPONENT16,
          width,
          height
        );

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          sceneTex,
          0
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
    };

    // Uniform locations
    const iSceneResLoc = gl.getUniformLocation(sceneProgram, "iResolution");
    const iTimeLoc = gl.getUniformLocation(sceneProgram, "iTime");
    const iCamPositionLoc = gl.getUniformLocation(sceneProgram, "iCamPosition");
    const iCamRotationLoc = gl.getUniformLocation(sceneProgram, "iCamRotation");

    const iToneMapResLoc = gl.getUniformLocation(tonemapProgram, "iResolution");
    const iSceneLoc = gl.getUniformLocation(tonemapProgram, "iScene");
    const iGammaLoc = gl.getUniformLocation(tonemapProgram, "iGamma");
    const iExposureLoc = gl.getUniformLocation(tonemapProgram, "iExposure");

    let currFrame: number;
    const frame = () => {
      if (gl === null) return;

      resize();

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.useProgram(sceneProgram);
      bindAttribs(sceneProgram);

      if (iSceneResLoc) gl.uniform2f(iSceneResLoc, canvas.width, canvas.height);
      if (iTimeLoc) gl.uniform1f(iTimeLoc, secondsSinceStart());
      if (iCamPositionLoc) gl.uniform3fv(iCamPositionLoc, cameraPosition);
      if (iCamRotationLoc) gl.uniform4fv(iCamRotationLoc, cameraRotation);

      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Tonemapping pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(tonemapProgram);
      bindAttribs(tonemapProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);

      if (iToneMapResLoc) {
        gl.uniform2f(iToneMapResLoc, canvas.width, canvas.height);
      }
      if (iSceneLoc) gl.uniform1i(iSceneLoc, 0);
      if (iGammaLoc) gl.uniform1f(iGammaLoc, 2.2);
      if (iExposureLoc) gl.uniform1f(iExposureLoc, 1.0);

      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      currFrame = requestAnimationFrame(frame);
    };

    // start loop; keep track of frame for deleting later
    currFrame = requestAnimationFrame(frame);

    // cleanup
    return () => {
      cancelAnimationFrame(currFrame);

      gl.deleteBuffer(quadVboId);
      gl.deleteTexture(sceneTex);
      gl.deleteFramebuffer(fbo);
      gl.deleteProgram(sceneProgram);
      gl.deleteProgram(tonemapProgram);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 h-full w-full" />;
};

export default ShaderCanvas;
