import { useEffect, useRef, useState } from "react";
import { createRenderer, type RenderStats as Stats } from "../lib/renderer";
import RenderStats from "./RenderStats";

const BlackoutToggleButton = ({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="cursor-pointer bg-black px-1 font-bold text-white hover:bg-white hover:text-black"
  >
    {children}
  </button>
);

const ShaderCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer>>(null);
  const [stats, setStats] = useState<Stats>({ fps: 0, samples: 0, noise: [] });
  const [error, setError] = useState("");
  const [outsideRoom, setOutsideRoom] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      console.error("Canvas ref should not be null.");
      return;
    }

    const renderer = createRenderer(canvas, setStats, setError, setOutsideRoom);
    rendererRef.current = renderer;

    return () => {
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="fixed h-full w-full" />
      {!error && <RenderStats stats={stats} />}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 font-mono text-white">
        {error && (
          <p role="alert" className="bg-black px-3 py-2 text-center">
            {error}
          </p>
        )}

        {!error && outsideRoom && (
          <BlackoutToggleButton
            onClick={() => rendererRef.current?.resetCamera()}
          >
            Return to origin
          </BlackoutToggleButton>
        )}

        {!error && (
          <BlackoutToggleButton
            onClick={() => rendererRef.current?.togglePathTrace()}
          >
            Toggle Path Trace
          </BlackoutToggleButton>
        )}
      </div>
    </>
  );
};

export default ShaderCanvas;
