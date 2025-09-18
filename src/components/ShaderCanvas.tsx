import { useEffect, useRef, useState } from "react";
import vertexShader from "../shaders/vertex.glsl?raw";
import fragmentShader from "../shaders/fragment.glsl?raw";
import { quat, vec3 } from "gl-matrix";

const VERTEX_SHADER = vertexShader;
const FRAGMENT_SHADER = fragmentShader;

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
    throw new Error(`Shader compile error: ${log}`);
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
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
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
    let program: WebGLProgram;
    try {
      program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    } catch (err) {
      console.error(err);
      return;
    }

    // full-screen quad drawn as two triangles
    const displayVertices = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);

    const displayVerticesBufferId = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, displayVerticesBufferId);
    gl.bufferData(gl.ARRAY_BUFFER, displayVertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Uniform locations
    const iResolutionLoc = gl.getUniformLocation(program, "iResolution");
    const iTimeLoc = gl.getUniformLocation(program, "iTime");
    const iCamPositionLoc = gl.getUniformLocation(program, "iCamPosition");
    const iCamRotationLoc = gl.getUniformLocation(program, "iCamRotation");

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
      gl.useProgram(program);

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
      gl.deleteBuffer(displayVerticesBufferId);
      gl.deleteProgram(program);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 h-full w-full" />;
};

export default ShaderCanvas;
