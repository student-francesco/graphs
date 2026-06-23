import { DataPointKind, type DataKindAdapter, type InternalDataPoint, type NumericDataPoint, type TemporalDataPointRaw } from "./types";

export interface AdapterBlueprint<Raw> {
  parse(raw: Raw): InternalDataPoint
  dump(point: InternalDataPoint): Raw
}
export function temporalAdapter(bp: AdapterBlueprint<TemporalDataPointRaw>): DataKindAdapter<TemporalDataPointRaw> {
  return { kind: DataPointKind.Temporal, ...bp }
}
export function numericAdapter(bp: AdapterBlueprint<NumericDataPoint>): DataKindAdapter<NumericDataPoint> {
  return { kind: DataPointKind.Numeric, ...bp }
}