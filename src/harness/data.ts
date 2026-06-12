import type { RawDataPoint } from '../lib/index.ts'

export function generateSeries(
  days: number,
  startDate = new Date('2024-01-01'),
  startValue = 100,
): RawDataPoint[] {
  const points: RawDataPoint[] = []
  let value = startValue
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + i)
    value += (Math.random() - 0.48) * 10
    points.push({ date: date.toISOString(), value: Math.max(1, value) })
  }
  return points
}

/** Slide the window forward by `steps` days, keeping the window size constant */
export function slideWindow(data: RawDataPoint[], steps: number): RawDataPoint[] {
  const sliced = data.slice(steps)
  const lastDate = new Date(sliced[sliced.length - 1]!.date)
  const tail = generateSeries(steps, new Date(lastDate.getTime() + 86_400_000))
  return [...sliced, ...tail]
}

/** Generate exponential/power-law data suitable for log-scale demo (values 0.1 → 10 000) */
export function generateExpSeries(days: number, startDate = new Date('2024-01-01')): RawDataPoint[] {
  const points: RawDataPoint[] = []
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + i)
    const value = 0.1 * Math.pow(10, (i / (days - 1)) * 5) * (0.8 + Math.random() * 0.4)
    points.push({ date: date.toISOString(), value })
  }
  return points
}
