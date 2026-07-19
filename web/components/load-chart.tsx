"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LoadChartProps {
  series: { hour: number; kw: number }[];
  colour: string;
  title: string;
  height?: number;
}

export function LoadChart({ series, colour, title, height = 190 }: LoadChartProps) {
  return (
    <div className="rounded border border-[#2a4438] bg-chart-navy p-2.5">
      <p className="mb-1 text-center text-[11px] font-semibold text-white/90">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="#2a4438" strokeWidth={0.6} />
          <XAxis
            dataKey="hour"
            tick={{ fill: "#c5d4cb", fontSize: 9 }}
            tickFormatter={(h: number) => formatHour(h)}
            ticks={[0, 6, 12, 18, 24, 30, 36, 42]}
            stroke="#2a4438"
          />
          <YAxis tick={{ fill: "#c5d4cb", fontSize: 9 }} stroke="#2a4438" />
          <Tooltip
            contentStyle={{
              background: "#0f1f18",
              border: "1px solid #2a4438",
              fontSize: 11,
              color: "#fff",
            }}
            labelFormatter={(h) => `${formatHour(Number(h))} (${Number(h) < 24 ? "Sat" : "Sun"})`}
            formatter={(value) => [`${Number(value).toFixed(1)} kW`, "Load"]}
          />
          <Line
            type="monotone"
            dataKey="kw"
            stroke={colour}
            strokeWidth={2.4}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatHour(h: number): string {
  const hod = h % 24;
  if (hod === 0) return "12am";
  if (hod === 12) return "12pm";
  return hod < 12 ? `${hod}am` : `${hod - 12}pm`;
}
