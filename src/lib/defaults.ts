import type { ChartSettings } from './types.ts'

/** Horizontal space reserved per additional stacked y-axis (px) */
export const AXIS_WIDTH = 50

export const DEFAULT_SETTINGS: ChartSettings = {
  curveType: 'monotoneX',
  lineWeight: 2,
  lineColor: '#4f46e5',
  dotRadius: 4,

  showGrid: true,
  gridColor: '#e5e7eb',
  gridOpacity: 0.7,

  showTooltip: true,
  tooltipDateFormat: '%b %d, %Y',
  tooltipValueFormat: '.2f',

  animationDuration: 750,
  easingType: 'easeCubicInOut',

  margins: { top: 20, right: 30, bottom: 40, left: 60 },

  xAxisFormatter: null,
  yAxisFormatter: null,

  ariaLabel: 'Line chart',

  minOverlapForTransition: 2,
  overlapThreshold: 0.3,

  setDataAnimation: 'drawOn',
  updateDataAnimation: 'morph',
  appendAnimation: 'none',

  maxDataPoints: null,
}
