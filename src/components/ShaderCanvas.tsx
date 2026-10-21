import { useEffect, useRef, useState } from "react";
import { createRenderer } from "../lib/renderer";

const ShaderCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer>>(null);
  const [stats, setStats] = useState({ fps: 0, samples: 0 });

  useEffect(() => {
    const renderer = createRenderer(canvasRef.current!, (fps, samples) =>
      setStats({ fps, samples }),
    );
    rendererRef.current = renderer;

    return () => {
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="fixed h-full w-full" />
      <div className="fixed top-4 right-4 grid grid-cols-[auto_auto] gap-x-2 font-mono text-white pointer-events-none">
        <span className="text-right">FPS:</span>
        <span>{stats.fps}</span>
        <span className="text-right">Samples:</span>
        <span>{stats.samples}</span>
      </div>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2">
        <button
          onClick={() => rendererRef.current?.togglePathTrace()}
          className="
            font-mono font-bold
            text-white hover:text-black
            bg-black hover:bg-neutral-100
            hover:underline hover:cursor-pointer px-1
          "
        >
          Toggle Path Trace
        </button>
      </div>
    </>
  );
};

export default ShaderCanvas;
