export type {
  TemporalDataPoint as DataPoint,
  TemporalDataPointRaw as RawDataPoint,
  ChartSettings,
  ChartMargins,
  CurveType,
  AnimationMode,
  EasingType,
  SeriesSettings,
  AxisSettings,
  AnnotationStyle,
  HorizontalAnnotationSettings,
  VerticalAnnotationSettings,
  ChartSnapshot,
  SerializableChartSettings,
  AxisSnapshot,
  SeriesSnapshot,
  SeriesModuleSnapshot,
  AnnotationSnapshot,
  ZoomSnapshot,
} from './types.ts'
export type { LineChartHandle } from './charts/line/types.ts'
export { DEFAULT_SETTINGS } from './defaults.ts'
export { lttb, movingAverage } from './transforms.ts'
export { createLineChart } from './charts/line/temporal-line.ts'
