import { useEffect, useRef } from "react";
import { createRenderer } from "../lib/renderer";

const ShaderCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer>>(null);

  useEffect(() => {
    const renderer = createRenderer(canvasRef.current!);
    rendererRef.current = renderer;

    return () => {
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="fixed h-full w-full" />
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
