const SampleGraph = ({
  title,
  points,
}: {
  title: string;
  points: { samples: number; value: number }[];
}) => {
  const maxSamples = points.at(-1)?.samples ?? 0;
  const maxValue = Math.max(0, ...points.map((point) => point.value));
  const line = points
    .map(
      (point) =>
        `${4 + (152 * point.samples) / maxSamples},${124 - (120 * point.value) / (maxValue || 1)}`,
    )
    .join(" ");

  return (
    <div className="mt-2 w-40 text-xs">
      <div>{title}</div>
      <svg width="160" height="128" role="img" aria-label={title}>
        <path
          d="M4 4V124H156"
          fill="none"
          stroke="currentColor"
          opacity="0.4"
        />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
};

export default SampleGraph;
