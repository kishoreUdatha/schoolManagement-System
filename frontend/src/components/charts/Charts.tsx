"use client";

import { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { SERIES, useChartTheme } from "@/components/charts/theme";

/** A chart in a panel, with room for a note about what it does not show.
 *
 *  Every chart here takes an `empty` line rather than drawing empty axes,
 *  because a blank grid reads as "nothing happened" when it usually means
 *  "nothing has been entered yet", and those are different problems.
 */
export function ChartCard({
  title,
  subtitle,
  actions,
  empty,
  height = 280,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  empty?: string | false;
  height?: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
        </div>
        {actions}
      </CardHeader>
      <CardBody>
        {empty ? (
          <div
            className="flex items-center justify-center text-[13px] text-ink-subtle"
            style={{ height }}
          >
            {empty}
          </div>
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              {children as never}
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const AXIS = { fontSize: 12, fontWeight: 600 };

function useCommon() {
  const t = useChartTheme();
  return {
    t,
    grid: <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />,
    tooltip: (
      <Tooltip
        cursor={{ fill: t.grid, fillOpacity: 0.35 }}
        contentStyle={{
          background: t.tooltipBg,
          border: `1px solid ${t.tooltipBorder}`,
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 600,
          color: t.tooltipInk,
        }}
        labelStyle={{ color: t.tooltipInk, fontWeight: 800 }}
      />
    ),
  };
}

export interface Series {
  key: string;
  name: string;
  color?: string;
}

/** A trend over months. Area when there is one series, lines when there are
 *  several — a stack of filled areas hides the shape of everything under it. */
export function TrendChart({
  data,
  x,
  series,
  yFormatter,
}: {
  data: Record<string, unknown>[];
  x: string;
  series: Series[];
  yFormatter?: (v: number) => string;
}) {
  const { t, grid, tooltip } = useCommon();
  const axes = (
    <>
      {grid}
      <XAxis dataKey={x} stroke={t.axis} tick={AXIS} tickLine={false} axisLine={false} />
      <YAxis
        stroke={t.axis}
        tick={AXIS}
        tickLine={false}
        axisLine={false}
        width={56}
        tickFormatter={yFormatter}
      />
      {tooltip}
    </>
  );

  if (series.length === 1) {
    const s = series[0];
    const color = s.color ?? SERIES[0];
    return (
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {axes}
        <Area
          type="monotone"
          dataKey={s.key}
          name={s.name}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#fill-${s.key})`}
        />
      </AreaChart>
    );
  }

  return (
    <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      {axes}
      <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 8 }} />
      {series.map((s, i) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.name}
          stroke={s.color ?? SERIES[i % SERIES.length]}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
      ))}
    </LineChart>
  );
}

/** A ranked breakdown. Horizontal when the labels are names, which they
 *  usually are — a class or a fee head does not fit under a vertical bar. */
export function BreakdownChart({
  data,
  x,
  series,
  layout = "horizontal",
  stacked = false,
  colorBy,
  xFormatter,
}: {
  data: Record<string, unknown>[];
  x: string;
  series: Series[];
  layout?: "horizontal" | "vertical";
  stacked?: boolean;
  colorBy?: (row: Record<string, unknown>, index: number) => string;
  xFormatter?: (v: number) => string;
}) {
  const { t, grid, tooltip } = useCommon();
  const sideways = layout === "vertical";

  return (
    <BarChart
      data={data}
      layout={layout}
      margin={{ top: 8, right: 12, left: sideways ? 8 : 0, bottom: 0 }}
      barCategoryGap={sideways ? "18%" : "22%"}
    >
      {grid}
      {sideways ? (
        <>
          <XAxis
            type="number"
            stroke={t.axis}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickFormatter={xFormatter}
          />
          <YAxis
            type="category"
            dataKey={x}
            stroke={t.axis}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={140}
          />
        </>
      ) : (
        <>
          <XAxis dataKey={x} stroke={t.axis} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis
            stroke={t.axis}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={xFormatter}
          />
        </>
      )}
      {tooltip}
      {series.length > 1 && (
        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 8 }} />
      )}
      {series.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.name}
          stackId={stacked ? "one" : undefined}
          fill={s.color ?? SERIES[i % SERIES.length]}
          radius={stacked ? 0 : sideways ? [0, 6, 6, 0] : [6, 6, 0, 0]}
          maxBarSize={sideways ? 26 : 48}
        >
          {colorBy &&
            data.map((row, index) => (
              <Cell key={index} fill={colorBy(row, index)} />
            ))}
        </Bar>
      ))}
    </BarChart>
  );
}

/** A share of a whole. A ring rather than a pie, so the total can sit in the
 *  middle instead of in a caption the eye has to travel to. */
export function ShareChart({
  data,
  nameKey,
  valueKey,
  centreLabel,
  centreValue,
}: {
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  centreLabel?: string;
  centreValue?: string;
}) {
  const { t, tooltip } = useCommon();
  return (
    <PieChart>
      {tooltip}
      <Legend
        layout="vertical"
        align="right"
        verticalAlign="middle"
        wrapperStyle={{ fontSize: 12, fontWeight: 700 }}
      />
      <Pie
        data={data}
        nameKey={nameKey}
        dataKey={valueKey}
        cx="40%"
        cy="50%"
        innerRadius={58}
        outerRadius={92}
        paddingAngle={2}
        stroke={t.tooltipBg}
        strokeWidth={2}
      >
        {data.map((_, i) => (
          <Cell key={i} fill={SERIES[i % SERIES.length]} />
        ))}
      </Pie>
      {centreValue && (
        <text
          x="40%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={t.tooltipInk}
          fontSize={22}
          fontWeight={800}
        >
          {centreValue}
        </text>
      )}
      {centreLabel && (
        <text
          x="40%"
          y="50%"
          dy={20}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={t.axis}
          fontSize={11}
          fontWeight={700}
        >
          {centreLabel}
        </text>
      )}
    </PieChart>
  );
}
