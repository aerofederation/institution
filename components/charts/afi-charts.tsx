'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { cn } from '@/lib/utils'

/**
 * Chart wrappers on the AFI palette.
 *
 * Thin on purpose. They fix the things that are easy to get inconsistent —
 * grid weight, axis treatment, tooltip styling, series colour, tabular
 * numerals — and leave the data shape to the caller.
 *
 * Colours come from the `--chart-*` tokens, so the same chart reads correctly
 * on the light public site and the dark command centre without a prop.
 *
 * Note the token names. `globals.css` declares its palette in a Tailwind v4
 * `@theme inline` block, which inlines the values into generated utilities and
 * does NOT emit them as custom properties — so `var(--color-chart-2)` resolves
 * to nothing and every series silently rendered black. The raw `--chart-*`
 * variables on `:root` are the ones that exist at runtime. `--color-border`
 * and `--color-muted-foreground` below do resolve, because the shadcn base
 * layer declares those separately; only the chart ramp was affected.
 */

type Point = { label: string; value: number }

const AXIS = {
  stroke: 'var(--color-muted-foreground)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  valueLabel: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="afi-metric text-sm font-semibold">
        {payload[0].value.toLocaleString('en-IN')}{' '}
        <span className="text-muted-foreground font-normal">{valueLabel}</span>
      </p>
    </div>
  )
}

export function AreaTrend({
  data,
  valueLabel,
  height = 240,
  colorIndex = 1,
}: {
  data: Point[]
  valueLabel: string
  height?: number
  colorIndex?: 1 | 2 | 3 | 4 | 5
}) {
  const color = `var(--chart-${colorIndex})`
  const gradientId = `afi-area-${colorIndex}-${valueLabel.replace(/\s+/g, '')}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} allowDecimals={false} width={44} />
        <Tooltip
          content={<ChartTooltip valueLabel={valueLabel} />}
          cursor={{ stroke: 'var(--color-border)' }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function BarSeries({
  data,
  valueLabel,
  height = 240,
  colorIndex = 1,
  horizontal = false,
}: {
  data: Point[]
  valueLabel: string
  height?: number
  colorIndex?: 1 | 2 | 3 | 4 | 5
  horizontal?: boolean
}) {
  const color = `var(--chart-${colorIndex})`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 8, bottom: 0, left: horizontal ? 8 : -18 }}
      >
        <CartesianGrid
          stroke="var(--color-border)"
          strokeDasharray="3 3"
          vertical={horizontal}
          horizontal={!horizontal}
        />
        {horizontal ? (
          <>
            <XAxis type="number" {...AXIS} allowDecimals={false} />
            <YAxis type="category" dataKey="label" {...AXIS} width={150} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} allowDecimals={false} width={44} />
          </>
        )}
        <Tooltip
          content={<ChartTooltip valueLabel={valueLabel} />}
          cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
        />
        <Bar dataKey="value" fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={color} opacity={1 - Math.min(index * 0.08, 0.5)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Card shell so every chart on a page shares one frame. */
export function ChartCard({
  title,
  description,
  children,
  className,
  footer,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  footer?: React.ReactNode
}) {
  return (
    <section className={cn('bg-card flex flex-col gap-4 rounded-lg border p-5', className)}>
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-sm font-semibold">{title}</h3>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="text-muted-foreground border-t pt-3 text-xs">{footer}</div> : null}
    </section>
  )
}
