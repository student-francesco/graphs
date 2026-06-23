import type { InternalDataPoint } from './types'

export function movingAverage(points: InternalDataPoint[], window: number): InternalDataPoint[] {
  if (window <= 1 || points.length === 0) return points
  return points.map((p, i) => {
    const start = Math.max(0, i - window + 1)
    let sum = 0
    for (let j = start; j <= i; j++) sum += points[j]!.y
    return { x: p.x, y: sum / (i - start + 1) }
  })
}

/** Coerce a polymorphic x-value to a number — epoch ms for Dates, identity for numbers. */
function numericX(x: InternalDataPoint['x']): number {
  return typeof x === 'number' ? x : x.getTime()
}

export function lttb(points: InternalDataPoint[], threshold: number): InternalDataPoint[] {
  if (threshold <= 0 || points.length <= threshold) return points

  const sampled: InternalDataPoint[] = [points[0]!]
  const bucketCount = threshold - 2
  const bucketSize = (points.length - 2) / bucketCount

  let prevSelected = 0

  for (let i = 0; i < bucketCount; i++) {
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, points.length - 1)

    // Average of the next bucket (used as point C in the triangle)
    const nextBucketStart = bucketEnd
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, points.length - 1)
    let avgX = 0
    let avgY = 0
    const nextCount = nextBucketEnd - nextBucketStart
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += numericX(points[j]!.x)
      avgY += points[j]!.y
    }
    if (nextCount > 0) {
      avgX /= nextCount
      avgY /= nextCount
    } else {
      // Last bucket: fall back to the final point
      avgX = numericX(points[points.length - 1]!.x)
      avgY = points[points.length - 1]!.y
    }

    const a = points[prevSelected]!
    const aX = numericX(a.x)
    const aY = a.y

    let maxArea = -1
    let selectedIdx = bucketStart

    for (let j = bucketStart; j < bucketEnd; j++) {
      const b = points[j]!
      const area = Math.abs((aX - avgX) * (b.y - aY) - (aX - numericX(b.x)) * (avgY - aY)) * 0.5
      if (area > maxArea) {
        maxArea = area
        selectedIdx = j
      }
    }

    sampled.push(points[selectedIdx]!)
    prevSelected = selectedIdx
  }

  sampled.push(points[points.length - 1]!)
  return sampled
}
