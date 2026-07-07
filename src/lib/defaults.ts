import type { ChartSettings } from './types.ts'

/** Horizontal space reserved per additional stacked y-axis (px) */
export const AXIS_WIDTH = 50

/** Extra top margin reserved when a chart title is set (px) */
export const TITLE_SPACE = 22
/** Extra bottom margin reserved when an x-axis label is set (px) */
export const X_LABEL_SPACE = 18
/** Extra left margin reserved when a y-axis label is set (px) */
export const Y_LABEL_SPACE = 18

export const DEFAULT_SETTINGS: ChartSettings = {
  curveType: 'monotoneX',
  lineWeight: 2,
  lineColor: '#4f46e5',
  dotRadius: 4,

  showGrid: true,
  gridColor: '#e5e7eb',
  gridOpacity: 0.7,
  yTickCount: null,

  showTooltip: true,
  tooltipDateFormat: '%b %d, %Y',
  tooltipValueFormat: '.2f',

  animationDuration: 750,
  easingType: 'easeCubicInOut',

  margins: { top: 20, right: 30, bottom: 40, left: 60 },

  xAxisFormatter: null,
  yAxisFormatter: null,
  xTickCount: null,

  xAxisBlurEnabled: true,
  xAxisBlurStrength: 4,

  ariaLabel: 'Line chart',

  minOverlapForTransition: 2,
  overlapThreshold: 0.3,

  setDataAnimation: 'drawOn',
  updateDataAnimation: 'morph',
  appendAnimation: 'none',

  maxDataPoints: null,

  showLabels: false,
  labelFormat: null,

  theme: 'light',
  dotBorderColor: null,

  title: null,
  xLabel: null,
  yLabel: null,

  smoothing: 0,
  decimation: 0,

  yScaleType: 'linear',

  zoomEnabled: true,
  zoomMode: 'x',
  zoomScaleExtent: [1, 100],
}
