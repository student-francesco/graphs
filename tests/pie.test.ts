import { describe, expect, it, vi } from 'vitest'
import { createPieChart, DEFAULT_PIE_SETTINGS } from '@/lib/index.ts'
import { PALETTE } from '@/lib/defaults.ts'
import { contrastText, relaxLabels, sliceLabelText } from '@/lib/modules/pie-labels.ts'
import { tweenStart } from '@/lib/modules/pie-slices.ts'
import type { PieChartSnapshot } from '@/lib/charts/pie/types.ts'
import { mountPieChart } from './helpers.ts'

const SAMPLE = [
  { label: 'Alpha', value: 50 },
  { label: 'Beta', value: 30 },
  { label: 'Gamma', value: 20 },
]

const tooltipEl = (): HTMLElement | null => document.body.querySelector('[role="tooltip"]')
const fills = (els: Element[]): (string | null)[] => els.map(e => e.getAttribute('fill'))
const keys = (els: Element[]): (string | null)[] => els.map(e => e.getAttribute('data-key'))

describe('pie chart — structure', () => {
  it('registers the shared modules plus the pie modules, and no line modules', () => {
    const { chart } = mountPieChart()
    const modular = chart as unknown as { getRegisteredModules(): string[]; explainPlan(): string }
    expect(modular.getRegisteredModules()).toEqual([
      'context',
      'settings',
      'pie-data',
      'animation',
      'pie-slices',
      'pie-labels',
      'tooltip',
      'export',
      'snapshot',
      'skeleton',
      'labels',
    ])
    const plan = modular.explainPlan()
    expect(plan).toContain('pie.layout')
    expect(plan).not.toContain('scales.build')
    expect(plan).not.toContain('animation.scrollPre')
  })

  it('throws for an unknown container id', () => {
    expect(() => createPieChart('pie-no-such-element')).toThrow(/PieChart: no element with id/)
  })

  it('shows the radial skeleton until data arrives, and again after clearData', () => {
    const { chart, $ } = mountPieChart()
    expect($('.lc-skeleton circle')).not.toBeNull()
    chart.setData(SAMPLE)
    expect($('.lc-skeleton')).toBeNull()
    chart.clearData()
    expect($('.lc-skeleton circle')).not.toBeNull()
    expect($('path.lc-slice')).toBeNull()
  })

  it('has no scroll chrome: no clip path, fade mask or blur overlay', () => {
    const { container } = mountPieChart()
    const area = container.querySelector('.lc-chart-area')!
    expect(area.getAttribute('clip-path')).toBeNull()
    expect(area.getAttribute('mask')).toBeNull()
    expect(Array.from(container.children).filter(c => c.tagName === 'DIV')).toHaveLength(0)
  })

  it('destroy removes all chart DOM and guards the api with the pie name', () => {
    const { chart, container } = mountPieChart()
    chart.setData(SAMPLE)
    chart.destroy()
    expect(container.querySelectorAll('svg')).toHaveLength(0)
    expect(() => chart.setData(SAMPLE)).toThrow(/PieChart: called on destroyed instance/)
  })

  it('sets the pie aria-label and theme on the root svg', () => {
    const { chart, container } = mountPieChart()
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-label')).toBe('Pie chart')
    chart.updateSettings({ theme: 'dark' })
    expect(svg.dataset.theme).toBe('dark')
  })
})

describe('pie chart — slices and colours', () => {
  it('draws one keyed slice path per slice, in input order', () => {
    const { chart, $all } = mountPieChart()
    chart.setData(SAMPLE)
    const slices = $all('path.lc-slice')
    expect(keys(slices)).toEqual(['Alpha', 'Beta', 'Gamma'])
    for (const s of slices) expect(s.getAttribute('d')).toMatch(/^M/)
  })

  it('cycles the palette, honours data colours, and setSliceColor overrides + resets', () => {
    const { chart, $all } = mountPieChart()
    chart.setData([...SAMPLE, { label: 'Delta', value: 5, color: '#123456' }])
    expect(fills($all('path.lc-slice'))).toEqual([PALETTE[0], PALETTE[1], PALETTE[2], '#123456'])

    chart.setSliceColor('Beta', '#abcdef')
    expect($all('path.lc-slice')[1]!.getAttribute('fill')).toBe('#abcdef')
    // A colour in the data beats an override.
    chart.setSliceColor('Delta', '#ff0000')
    expect($all('path.lc-slice')[3]!.getAttribute('fill')).toBe('#123456')

    chart.setSliceColor('Beta', null)
    expect($all('path.lc-slice')[1]!.getAttribute('fill')).toBe(PALETTE[1])
  })

  it('keeps each label’s palette colour stable across updates, until clearData', () => {
    const { chart, $all } = mountPieChart()
    chart.setData(SAMPLE)
    chart.updateData([{ label: 'Gamma', value: 1 }, { label: 'New', value: 1 }])
    expect(fills($all('path.lc-slice'))).toEqual([PALETTE[2], PALETTE[3]])
    chart.clearData()
    chart.setData([{ label: 'New', value: 1 }])
    expect(fills($all('path.lc-slice'))).toEqual([PALETTE[0]])
  })

  it('pieColors replaces the palette for every slice without an explicit colour', () => {
    const { chart, $all } = mountPieChart()
    chart.setData(SAMPLE)
    chart.updateSettings({ pieColors: ['#111111', '#222222'] })
    expect(fills($all('path.lc-slice'))).toEqual(['#111111', '#222222', '#111111'])
  })

  it('updateData adds and removes slices by label', () => {
    const { chart, $all } = mountPieChart()
    chart.setData(SAMPLE)
    chart.updateData([{ label: 'Beta', value: 10 }, { label: 'Omega', value: 10 }])
    expect(keys($all('path.lc-slice'))).toEqual(['Beta', 'Omega'])
  })

  it('a donut ratio carves an inner radius into every arc', () => {
    const { chart, $all } = mountPieChart({ sliceLabels: 'none' })
    chart.setData(SAMPLE)
    const pieD = $all('path.lc-slice')[0]!.getAttribute('d')!
    chart.updateSettings({ innerRadius: 0.5 })
    const donutD = $all('path.lc-slice')[0]!.getAttribute('d')!
    // A full-pie slice has one arc command; a donut slice has the outer and inner arc.
    expect(pieD.match(/A/g)).toHaveLength(1)
    expect(donutD.match(/A/g)).toHaveLength(2)
  })

  it('slice borders default to the theme surface and follow the settings', () => {
    const { chart, $ } = mountPieChart()
    chart.setData(SAMPLE)
    expect($('path.lc-slice')!.getAttribute('stroke')).toBe('#ffffff')
    chart.updateSettings({ theme: 'dark' })
    expect($('path.lc-slice')!.getAttribute('stroke')).toBe('#1a1815')
    chart.updateSettings({ sliceBorderColor: '#ff00ff', sliceBorderWidth: 3 })
    expect($('path.lc-slice')!.getAttribute('stroke')).toBe('#ff00ff')
    expect($('path.lc-slice')!.getAttribute('stroke-width')).toBe('3')
  })

  it('rejects duplicate labels and clamps invalid values with a warning', () => {
    const { chart, $all } = mountPieChart()
    expect(() => chart.setData([{ label: 'A', value: 1 }, { label: 'A', value: 2 }])).toThrow(
      /PieChart: duplicate slice label "A"/,
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    chart.setData([{ label: 'A', value: -4 }, { label: 'B', value: 2 }])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('slice "A" has invalid value -4'))
    warn.mockRestore()
    // The zero slice stays in the join (stable keys) but gets no label.
    expect(keys($all('path.lc-slice'))).toEqual(['A', 'B'])
    expect($all('.lc-slice-label text').map(t => t.textContent)).toEqual(['B: 100%'])
  })
})

describe('pie chart — text labels', () => {
  it('labels sit next to the slices with leader lines by default', () => {
    const { chart, $all } = mountPieChart()
    chart.setData(SAMPLE)
    const texts = $all('.lc-slice-label text')
    expect(texts.map(t => t.textContent)).toEqual(['Alpha: 50%', 'Beta: 30%', 'Gamma: 20%'])
    expect($all('polyline.lc-slice-leader')).toHaveLength(3)
    // Alpha's midline points right (start anchor), Gamma's left (end anchor).
    expect(texts[0]!.getAttribute('text-anchor')).toBe('start')
    expect(texts[2]!.getAttribute('text-anchor')).toBe('end')
  })

  it('outside labels reserve side margins, shrinking the pie', () => {
    const outside = mountPieChart()
    outside.chart.setData(SAMPLE)
    const inside = mountPieChart({ sliceLabelPosition: 'inside' })
    inside.chart.setData(SAMPLE)
    const radius = (d: string): number => Number(/A([\d.]+),/.exec(d)![1])
    const rOut = radius(outside.$('path.lc-slice')!.getAttribute('d')!)
    const rIn = radius(inside.$('path.lc-slice')!.getAttribute('d')!)
    expect(rOut).toBeLessThan(rIn)
  })

  it('every label content mode renders the matching text', () => {
    const { chart, $all } = mountPieChart({ sliceValueFormat: '.0f' })
    chart.setData(SAMPLE)
    const text = (): (string | null)[] => $all('.lc-slice-label text').map(t => t.textContent)
    chart.updateSettings({ sliceLabels: 'label' })
    expect(text()).toEqual(['Alpha', 'Beta', 'Gamma'])
    chart.updateSettings({ sliceLabels: 'value' })
    expect(text()).toEqual(['50', '30', '20'])
    chart.updateSettings({ sliceLabels: 'percent' })
    expect(text()).toEqual(['50%', '30%', '20%'])
    chart.updateSettings({ sliceLabels: 'label-value' })
    expect(text()).toEqual(['Alpha: 50', 'Beta: 30', 'Gamma: 20'])
    chart.updateSettings({ sliceLabels: 'none' })
    expect(text()).toEqual([])
  })

  it('inside labels drop their leaders and use a contrasting colour', () => {
    const { chart, $all } = mountPieChart({ sliceLabels: 'percent' })
    chart.setData(SAMPLE)
    chart.updateSettings({ sliceLabelPosition: 'inside' })
    expect($all('polyline.lc-slice-leader')).toHaveLength(0)
    const t = $all('.lc-slice-label text')
    expect(t).toHaveLength(3)
    expect(t[0]!.getAttribute('text-anchor')).toBe('middle')
    expect(t[0]!.getAttribute('fill')).toBe(contrastText(PALETTE[0]!))
    // Switching back re-creates the leaders.
    chart.updateSettings({ sliceLabelPosition: 'outside' })
    expect($all('polyline.lc-slice-leader')).toHaveLength(3)
  })
})

describe('pie chart — tooltip', () => {
  it('one arc-shaped hover zone per non-empty slice, showing label, value, percent and swatch', () => {
    const { chart, $all } = mountPieChart({ sliceValueFormat: '.1f' })
    chart.setData([...SAMPLE, { label: 'Empty', value: 0 }])
    const zones = $all('path.lc-hover-zone')
    expect(zones).toHaveLength(3)
    expect(zones[0]!.getAttribute('transform')).toMatch(/^translate\(/)

    zones[1]!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 40, clientY: 40 }))
    const tip = tooltipEl()!
    expect(tip.style.opacity).toBe('1')
    expect(tip.innerHTML).toContain('Beta')
    expect(tip.innerHTML).toContain('30.0 (30%)')
    expect(tip.innerHTML).toContain(`background:${PALETTE[1]}`)
  })

  it('escapes slice labels in the tooltip', () => {
    const { chart, $all } = mountPieChart()
    chart.setData([{ label: '<b>x</b>', value: 1 }])
    $all('path.lc-hover-zone')[0]!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    expect(tooltipEl()!.innerHTML).not.toContain('<b>')
  })

  it('showTooltip:false renders no hover zones', () => {
    const { chart, $all } = mountPieChart({ showTooltip: false })
    chart.setData(SAMPLE)
    expect($all('.lc-hover-zone')).toHaveLength(0)
    expect(tooltipEl()).toBeNull()
  })
})

describe('pie chart — snapshot', () => {
  it('round-trips settings, slices, colour overrides and palette assignments', () => {
    const a = mountPieChart()
    a.chart.setData(SAMPLE)
    a.chart.setSliceColor('Gamma', '#00ff00')
    a.chart.updateSettings({ innerRadius: 0.4, title: 'Share' })
    const snap: PieChartSnapshot = JSON.parse(JSON.stringify(a.chart.getSnapshot()))
    expect(snap.version).toBe(2)
    expect(Object.keys(snap.modules)).toEqual(['settings', 'pie'])
    expect(snap.modules.pie.colorOverrides).toEqual({ Gamma: '#00ff00' })

    const b = mountPieChart()
    b.chart.restoreSnapshot(snap)
    expect(keys(b.$all('path.lc-slice'))).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(fills(b.$all('path.lc-slice'))).toEqual([PALETTE[0], PALETTE[1], '#00ff00'])
    expect(b.$('.lc-title')!.textContent).toBe('Share')
    expect(b.chart.getSnapshot()).toEqual(snap)
  })

  it('rejects non-version-2 snapshots with the pie prefix', () => {
    const { chart } = mountPieChart()
    expect(() => chart.restoreSnapshot({ version: 1 } as unknown as PieChartSnapshot)).toThrow(
      /PieChart: unsupported snapshot version 1/,
    )
  })

  it('settings snapshot carries the complete pie defaults', () => {
    const { chart } = mountPieChart()
    const settings = chart.getSnapshot().modules.settings
    expect(Object.keys(settings).sort()).toEqual(Object.keys(DEFAULT_PIE_SETTINGS).sort())
  })
})

describe('pie internals', () => {
  it('relaxLabels spaces overlapping labels and keeps them in bounds, preserving order', () => {
    expect(relaxLabels([0, 1, 2], 10, -100, 100)).toEqual([0, 10, 20])
    expect(relaxLabels([95, 96], 10, -100, 100)).toEqual([90, 100])
    expect(relaxLabels([5, -50], 10, -100, 100)).toEqual([5, -50])
  })

  it('tweenStart sweeps from 12 o’clock on drawOn and resumes from the live arc otherwise', () => {
    const target = { startAngle: 1, endAngle: 2, innerRadius: 0, outerRadius: 50 }
    const live = { startAngle: 0.5, endAngle: 1.5, innerRadius: 0, outerRadius: 40 }
    expect(tweenStart('drawOn', live, target)).toEqual({ ...target, startAngle: 0, endAngle: 0 })
    expect(tweenStart('morph', live, target)).toEqual(live)
    expect(tweenStart('morph', live, target)).not.toBe(live)
    expect(tweenStart('morph', undefined, target)).toEqual({ ...target, endAngle: 1 })
  })

  it('sliceLabelText and contrastText', () => {
    const fmt = (v: number): string => v.toFixed(1)
    expect(sliceLabelText('label-percent', 'A', 3, 0.125, fmt)).toBe('A: 12.5%')
    expect(sliceLabelText('label-value', 'A', 3, 0.125, fmt)).toBe('A: 3.0')
    expect(contrastText('#ffff00')).toBe('#111827')
    expect(contrastText('#1e3a8a')).toBe('#ffffff')
  })
})
