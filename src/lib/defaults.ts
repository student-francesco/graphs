import type { ChartSettings, PieChartSettings } from './types.ts'

/** Categorical palette new series / pie slices cycle through. */
export const PALETTE: readonly string[] = [
  '#e11d48', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0284c7', '#4f46e5',
]

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
  xDomainPadding: 0,

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
  xScaleType: 'linear',

  zoomEnabled: true,
  zoomMode: 'x',
  zoomScaleExtent: [1, 100],
  zoomBounded: true,
}

/** Complete pie chart defaults — the pie's settings module ships this whole object. */
export const DEFAULT_PIE_SETTINGS: PieChartSettings = {
  showTooltip: true,

  animationDuration: 750,
  easingType: 'easeCubicInOut',
  setDataAnimation: 'drawOn',
  updateDataAnimation: 'morph',
  appendAnimation: 'none',

  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  ariaLabel: 'Pie chart',

  theme: 'light',
  title: null,
  xLabel: null,
  yLabel: null,

  pieColors: [...PALETTE],
  innerRadius: 0,
  sliceBorderColor: null,
  sliceBorderWidth: 1,
  sliceLabels: 'label-percent',
  sliceLabelPosition: 'outside',
  sliceValueFormat: ',.2~f',
}
