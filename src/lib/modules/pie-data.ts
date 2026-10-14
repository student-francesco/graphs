import {
  prepareStep,
  storeSpec,
  token,
  type ChartModule,
  type Token,
  type TriggerInfo,
} from '@/lib/engine/index.ts'
import { PALETTE } from '@/lib/defaults.ts'
import type { PieDataSnapshot, PieSlice } from '@/lib/types.ts'
import { HasData, PieSettings, PieSlices, type ResolvedPieSlice } from './tokens.ts'

export interface PieStoreState {
  /** Sanitized slices in input order (label unique, value finite and >= 0). */
  readonly slices: readonly PieSlice[]
  /** setSliceColor overrides by label. */
  readonly overrides: ReadonlyMap<string, string>
  /** Ordinal palette: label → palette index, assigned in first-seen order. */
  readonly palette: ReadonlyMap<string, number>
  readonly nextPaletteIndex: number
}

export const PieStore: Token<PieStoreState> = token('pie.store')

const EMPTY: PieStoreState = {
  slices: [],
  overrides: new Map(),
  palette: new Map(),
  nextPaletteIndex: 0,
}

/**
 * Validate interop input: labels are the slice identity (duplicates throw),
 * values must be finite and non-negative (anything else is clamped to 0 with a
 * warning — a pie cannot draw it).
 */
export function sanitizeSlices(input: readonly PieSlice[]): PieSlice[] {
  if (!Array.isArray(input)) throw new Error('PieChart: setData expects an array of slices')
  const seen = new Set<string>()
  return input.map(raw => {
    const label = String(raw.label)
    if (seen.has(label)) throw new Error(`PieChart: duplicate slice label "${label}"`)
    seen.add(label)
    let value = Number(raw.value)
    if (!Number.isFinite(value) || value < 0) {
      console.warn(`PieChart: slice "${label}" has invalid value ${String(raw.value)} — drawn as 0`)
      value = 0
    }
    return raw.color ? { label, value, color: String(raw.color) } : { label, value }
  })
}

/** Give every not-yet-seen label the next palette index (d3.scaleOrdinal semantics). */
function assignPalette(
  state: PieStoreState,
  slices: readonly PieSlice[],
): Pick<PieStoreState, 'palette' | 'nextPaletteIndex'> {
  let next = state.nextPaletteIndex
  let palette = state.palette
  for (const s of slices) {
    if (palette.has(s.label)) continue
    if (palette === state.palette) palette = new Map(palette)
    ;(palette as Map<string, number>).set(s.label, next++)
  }
  return { palette, nextPaletteIndex: next }
}

/**
 * The pie's data: owns the slice store, the HasData signal and the colour
 * cascade (slice colour in the data > setSliceColor override > the `pieColors`
 * palette by stable per-label index), plus the data API and its snapshot slice.
 */
export function pieDataModule(): ChartModule {
  return {
    id: 'pie-data',
    stores: [storeSpec({ token: PieStore, init: () => EMPTY })],

    prepare: [
      prepareStep({
        id: 'pie.hasData',
        description: 'Whether any slice has a positive value (dismisses the skeleton).',
        reads: { store: PieStore },
        provides: HasData,
        run: ({ store }) => store.slices.some(s => s.value > 0),
      }),
      prepareStep({
        id: 'pie.slices',
        description: 'Resolve each slice’s colour: data colour > setSliceColor override > palette.',
        reads: { store: PieStore, settings: PieSettings },
        provides: PieSlices,
        run: ({ store, settings }): readonly ResolvedPieSlice[] => {
          const colors = settings.pieColors.length > 0 ? settings.pieColors : PALETTE
          return store.slices.map(s => ({
            label: s.label,
            value: s.value,
            color:
              s.color ??
              store.overrides.get(s.label) ??
              colors[(store.palette.get(s.label) ?? 0) % colors.length]!,
          }))
        },
      }),
    ],

    api(rt) {
      const store = rt.store(PieStore)
      const replace = (input: readonly PieSlice[], trigger: TriggerInfo): void => {
        const slices = sanitizeSlices(input)
        store.update(current => ({ ...current, slices, ...assignPalette(current, slices) }), trigger)
        rt.flushSync()
      }
      return {
        setData: (slices: PieSlice[]): void => replace(slices, { kind: 'setData' }),
        updateData: (slices: PieSlice[]): void => replace(slices, { kind: 'updateData' }),
        clearData: (): void => {
          // Overrides are styling and survive; the palette restarts like a fresh chart.
          store.update(
            current => ({ ...current, slices: [], palette: new Map(), nextPaletteIndex: 0 }),
            { kind: 'setData' },
          )
          rt.flushSync()
        },
        setSliceColor: (label: string, color: string | null): void => {
          store.update(current => {
            const overrides = new Map(current.overrides)
            if (color === null || color === undefined || color === '') overrides.delete(label)
            else overrides.set(label, color)
            return { ...current, overrides }
          }, { kind: 'mutation' })
          rt.flushSync()
        },
      }
    },

    state(rt) {
      const store = rt.store(PieStore)
      return {
        key: 'pie',
        capture: (): PieDataSnapshot => {
          const s = store.get()
          return {
            slices: s.slices.map(slice => ({ ...slice })),
            colorOverrides: Object.fromEntries(s.overrides),
            palette: { assignments: Object.fromEntries(s.palette), next: s.nextPaletteIndex },
          }
        },
        restore: value => {
          const snap = value as PieDataSnapshot
          store.set({
            slices: sanitizeSlices(snap.slices ?? []),
            overrides: new Map(Object.entries(snap.colorOverrides ?? {})),
            palette: new Map(Object.entries(snap.palette?.assignments ?? {})),
            nextPaletteIndex: snap.palette?.next ?? 0,
          })
        },
      }
    },
  }
}
