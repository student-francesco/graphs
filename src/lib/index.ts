export type {
  TemporalDataPoint as DataPoint,
  TemporalDataPointRaw as RawDataPoint,
  NumericDataPoint,
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
  PdfExportOptions as PDFExportOptions
} from './types.ts'
export type { LineChartHandle } from './charts/line/types.ts'
export type { NumericChartHandle } from './charts/numeric-line/types.ts'
export { DEFAULT_SETTINGS } from './defaults.ts'
export { lttb, movingAverage } from './transforms.ts'
export { createLineChart } from './charts/line/temporal-line.ts'
export { createNumericChart } from './charts/numeric-line/numeric-line.ts'
