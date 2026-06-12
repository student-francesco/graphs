import * as d3 from 'd3'
import type { CurveType, EasingType } from './types.ts'

export const EASING_MAP: Record<EasingType, (t: number) => number> = {
  easeLinear:      d3.easeLinear,
  easeQuadIn:      d3.easeQuadIn,    easeQuadOut:      d3.easeQuadOut,    easeQuadInOut:      d3.easeQuadInOut,
  easeCubicIn:     d3.easeCubicIn,   easeCubicOut:     d3.easeCubicOut,   easeCubicInOut:     d3.easeCubicInOut,
  easeSinIn:       d3.easeSinIn,     easeSinOut:       d3.easeSinOut,     easeSinInOut:       d3.easeSinInOut,
  easeExpIn:       d3.easeExpIn,     easeExpOut:       d3.easeExpOut,     easeExpInOut:       d3.easeExpInOut,
  easeCircleIn:    d3.easeCircleIn,  easeCircleOut:    d3.easeCircleOut,  easeCircleInOut:    d3.easeCircleInOut,
  easeBackIn:      d3.easeBackIn,    easeBackOut:      d3.easeBackOut,    easeBackInOut:      d3.easeBackInOut,
  easeBounceIn:    d3.easeBounceIn,  easeBounceOut:    d3.easeBounceOut,  easeBounceInOut:    d3.easeBounceInOut,
  easeElasticIn:   d3.easeElasticIn, easeElasticOut:   d3.easeElasticOut, easeElasticInOut:   d3.easeElasticInOut,
}

export const CURVE_MAP: Record<CurveType, d3.CurveFactory | d3.CurveFactoryLineOnly> = {
  linear: d3.curveLinear,
  monotoneX: d3.curveMonotoneX,
  monotoneY: d3.curveMonotoneY,
  natural: d3.curveNatural,
  basis: d3.curveBasis,
  cardinal: d3.curveCardinal,
  catmullRom: d3.curveCatmullRom,
  step: d3.curveStep,
  stepBefore: d3.curveStepBefore,
  stepAfter: d3.curveStepAfter,
}
