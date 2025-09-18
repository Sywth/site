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
    let scenProgram = createProgram(gl, vertexShader, fragmentShader);
    if (scenProgram === null) {
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
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVboId);
    gl.bufferData(gl.ARRAY_BUFFER, quadVboData, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(scenProgram, "aPosition");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Uniform locations
    const iResolutionLoc = gl.getUniformLocation(scenProgram, "iResolution");
    const iTimeLoc = gl.getUniformLocation(scenProgram, "iTime");
    const iCamPositionLoc = gl.getUniformLocation(scenProgram, "iCamPosition");
    const iCamRotationLoc = gl.getUniformLocation(scenProgram, "iCamRotation");

    const resize = () => {
      if (gl === null) return;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const frame = () => {
      if (gl === null) return;

      resize();
      gl.useProgram(scenProgram);

      if (iResolutionLoc) {
        gl.uniform2f(iResolutionLoc, canvas.width, canvas.height);
      }

      if (iTimeLoc) {
        gl.uniform1f(iTimeLoc, secondsSinceStart());
      }

      if (iCamPositionLoc) {
        gl.uniform3fv(iCamPositionLoc, cameraPosition);
      }

      if (iCamRotationLoc) {
        gl.uniform4fv(iCamRotationLoc, cameraRotation);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(frame);
    };

    // start loop
    requestAnimationFrame(frame);

    // cleanup
    return () => {
      gl.deleteBuffer(quadVboId);
      gl.deleteProgram(scenProgram);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 h-full w-full" />;
};

export default ShaderCanvas;
