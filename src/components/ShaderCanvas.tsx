import { useEffect, useRef, useState } from "react";
import { createRenderer, type RenderStats as Stats } from "../lib/renderer";
import RenderStats from "./RenderStats";

const ShaderCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer>>(null);
  const [stats, setStats] = useState<Stats>({ fps: 0, samples: 0, noise: [] });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      console.error("Canvas ref should not be null.");
      return;
    }

    const renderer = createRenderer(canvas, setStats);
    rendererRef.current = renderer;

    return () => {
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="fixed h-full w-full" />
      <RenderStats stats={stats} />
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
