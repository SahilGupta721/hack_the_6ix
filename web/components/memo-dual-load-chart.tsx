"use client";

/** Print-safe dual load chart (pure SVG — survives Export / print). */

interface MemoDualLoadChartProps {
  seriesA: number[];
  seriesB: number[];
  labelA?: string;
  labelB?: string;
  height?: number;
}

export function MemoDualLoadChart({
  seriesA,
  seriesB,
  labelA = "Option A",
  labelB = "Option B",
  height = 132,
}: MemoDualLoadChartProps) {
  const n = Math.max(seriesA.length, seriesB.length, 1);
  const maxKw = Math.max(...seriesA, ...seriesB, 1);
  const padL = 36;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const W = 560;
  const H = height;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const toPoints = (series: number[]) =>
    series
      .map((kw, i) => {
        const x = padL + (i / Math.max(n - 1, 1)) * innerW;
        const y = padT + innerH - (kw / maxKw) * innerH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const ticks = [0, 12, 24, 36, 47].filter((h) => h < n);
  const yTicks = [0, 0.5, 1].map((f) => Math.round(maxKw * f));

  return (
    <div className="memo-chart w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`48h load: ${labelA} vs ${labelB}`}
      >
        <rect x={0} y={0} width={W} height={H} fill="#f8fafc" rx={4} />
        {yTicks.map((kw) => {
          const y = padT + innerH - (kw / maxKw) * innerH;
          return (
            <g key={kw}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={padL - 4}
                y={y + 3}
                textAnchor="end"
                fill="#64748b"
                fontSize={9}
              >
                {kw}
              </text>
            </g>
          );
        })}
        {ticks.map((h) => {
          const x = padL + (h / Math.max(n - 1, 1)) * innerW;
          return (
            <text
              key={h}
              x={x}
              y={H - 6}
              textAnchor="middle"
              fill="#64748b"
              fontSize={9}
            >
              {formatHour(h)}
            </text>
          );
        })}
        <polyline
          fill="none"
          stroke="#e5484d"
          strokeWidth={2.2}
          points={toPoints(seriesA)}
        />
        <polyline
          fill="none"
          stroke="#0d7a55"
          strokeWidth={2.2}
          points={toPoints(seriesB)}
        />
        <g transform={`translate(${padL + 4}, ${padT + 2})`}>
          <rect width={9} height={3} y={4} fill="#e5484d" />
          <text x={12} y={8} fill="#334155" fontSize={9}>
            {labelA}
          </text>
          <rect x={88} width={9} height={3} y={4} fill="#0d7a55" />
          <text x={100} y={8} fill="#334155" fontSize={9}>
            {labelB}
          </text>
          <text x={innerW - 4} y={8} textAnchor="end" fill="#94a3b8" fontSize={8}>
            kW
          </text>
        </g>
      </svg>
    </div>
  );
}

function formatHour(h: number): string {
  const hod = h % 24;
  if (hod === 0) return "12a";
  if (hod === 12) return "12p";
  return hod < 12 ? `${hod}a` : `${hod - 12}p`;
}
