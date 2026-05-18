import type { DataPoint } from './types'

export function movingAverage(points: DataPoint[], window: number): DataPoint[] {
  if (window <= 1 || points.length === 0) return points
  return points.map((p, i) => {
    const start = Math.max(0, i - window + 1)
    let sum = 0
    for (let j = start; j <= i; j++) sum += points[j]!.value
    return { date: p.date, value: sum / (i - start + 1) }
  })
}
