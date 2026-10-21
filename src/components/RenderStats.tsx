import type { RenderStats as Stats } from "../lib/renderer";
import SampleGraph from "./SampleGraph";

const RenderStats = ({ stats }: { stats: Stats }) => (
  <div className="fixed top-2 right-2 hidden lg:block font-mono text-white pointer-events-none">
    <div className="text-right">
      FPS: {stats.fps}, Samples: {stats.samples}
    </div>
    <div className="flex gap-4">
      <SampleGraph
        title="Estimated noise versus samples"
        points={stats.noise}
      />
      <SampleGraph
        title="Relative noise versus samples"
        points={stats.noise.map((point) => ({
          samples: point.samples,
          value: point.relative,
        }))}
      />
    </div>
  </div>
);

export default RenderStats;
