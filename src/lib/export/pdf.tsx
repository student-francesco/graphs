import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import type { ExportProps } from '.';
import { LOGO_DARK, LOGO_LIGHT } from './assets.ts'

// The two typefaces the Claude Design proposal (Chart Export Page.dc.html) is built on.
// Sourced directly from Google Fonts' own CDN (the same css2 request the proposal's
// <link> tag makes), not a guessed URL — react-pdf needs a direct TTF/OTF src, so the
// woff2 the browser would normally get isn't usable here.
Font.register({
    family: 'IBM Plex Sans',
    fonts: [
        { src: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf', fontWeight: 400 },
        { src: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD2FlzAA.ttf', fontWeight: 500 },
        { src: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDNF5zAA.ttf', fontWeight: 600 },
        { src: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDDV5zAA.ttf', fontWeight: 700 },
    ],
})

// The Google Fonts CDN build of IBM Plex Mono (v20, both weights) has a corrupt space-glyph
// glyf entry that crashes fontkit's bounding-box parser on any text containing a space —
// which any real footer text does. Sourced these two static weights from the font's own
// canonical upstream (google/fonts, pinned to a commit) instead, verified glyph-safe.
Font.register({
    family: 'IBM Plex Mono',
    fonts: [
        { src: 'https://raw.githubusercontent.com/google/fonts/633f3200539c52ee0aba2dfd7f46921417a81877/ofl/ibmplexmono/IBMPlexMono-Regular.ttf', fontWeight: 400 },
        { src: 'https://raw.githubusercontent.com/google/fonts/633f3200539c52ee0aba2dfd7f46921417a81877/ofl/ibmplexmono/IBMPlexMono-Medium.ttf', fontWeight: 500 },
    ],
})

const LIGHT = {
    pageBg: '#ffffff',
    text: '#1a1a20',
    sub: '#65656f',
    muted: '#7a7a84',
    hairline: '#e8e8e8',
    logo: LOGO_LIGHT,
}

const DARK = {
    pageBg: '#17171c',
    text: '#ececf0',
    sub: '#9a9aa6',
    muted: '#8a8a96',
    hairline: '#2e2e33',
    logo: LOGO_DARK,
}

// A4 landscape, in points (react-pdf/pdfkit's own constant: A4 portrait is 595.28 x 841.89).
const PAGE_WIDTH = 841.89
const PAGE_HEIGHT = 595.28
const MAIN_PADDING_H = 32

// Chart-to-page proportions lifted from the Claude Design proposal (Chart Export Page.dc.html:
// 1100x850 document, 1020x430 chart), reapplied to the current page size.
const CHART_WIDTH_RATIO = 1020 / 1100
const CHART_HEIGHT_RATIO = 430 / 850

// Fit srcRatio (width/height) inside a box without stretching it in either axis.
function containSize(srcRatio: number, boxW: number, boxH: number) {
    const boxRatio = boxW / boxH
    return srcRatio > boxRatio
        ? { width: boxW, height: boxW / srcRatio }
        : { width: boxH * srcRatio, height: boxH }
}

// logo-inficon.svg / logo-inficon-white.svg both declare viewBox="0 0 471.64 94.53".
// @react-pdf/layout's Image→Svg conversion reads style.width directly (falling back to the
// SVG's own intrinsic width when unset) instead of the Yoga-resolved box width, then centers
// the aspect-scaled artwork inside that width. Omitting an explicit width here made it center
// inside a phantom ~472pt-wide box instead of the ~100pt one it actually occupies — a big
// unwanted left "padding". Setting both width and height explicitly avoids that fallback.
const LOGO_HEIGHT = 20
const LOGO_WIDTH = LOGO_HEIGHT * (471.64 / 94.53)

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        height: '52px',
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        paddingHorizontal: 40,
    },
    logo: { height: LOGO_HEIGHT, width: LOGO_WIDTH },
    // Positioning context for the graph below: everything inside is placed with
    // position: 'absolute' + left/top percentages, resolved against this box (the
    // content band between header and footer — "the view").
    main: {
        flexGrow: 1,
        position: 'relative',
    },
    title: {
        fontFamily: 'IBM Plex Sans',
        fontWeight: 700,
        fontSize: 18,
        letterSpacing: -0.1,
        textAlign: 'center',
        position: 'absolute',
        left: MAIN_PADDING_H,
        right: MAIN_PADDING_H,
    },
    subtitle: {
        fontFamily: 'IBM Plex Sans',
        fontWeight: 500,
        fontSize: 10,
        textAlign: 'center',
        position: 'absolute',
        left: MAIN_PADDING_H,
        right: MAIN_PADDING_H,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 16,
        paddingHorizontal: 40,
        borderTopWidth: 1,
        borderTopStyle: 'solid',
    },
    footerLeft: { fontFamily: 'IBM Plex Mono', fontSize: 8 },
    footerRight: { fontFamily: 'IBM Plex Mono', fontSize: 7.5 },
})

const Doc = (props: ExportProps) => {
    const C = props.theme === 'dark' ? DARK : LIGHT

    const availableWidth = PAGE_WIDTH - MAIN_PADDING_H * 2
    const boxWidth = Math.min(availableWidth, CHART_WIDTH_RATIO * PAGE_WIDTH)
    const boxHeight = CHART_HEIGHT_RATIO * PAGE_HEIGHT
    const chartSize = containSize(props.chartAspectRatio, boxWidth, boxHeight)

    // react-pdf's transform parser reads "-50%" as the literal number -50 (points), not as
    // -50% of the element's own size like a browser would — so centering via
    // left/top: 50% + transform: translate(-50%, -50%) silently breaks here. Using the
    // graph's own known pixel size to build an exact point-based translate keeps the
    // technique the user asked for while actually landing it dead-center.
    const chartStyle = {
        ...chartSize,
        position: 'absolute' as const,
        left: '50%',
        top: '50%',
        transform: `translate(${-chartSize.width / 2}, ${-chartSize.height / 2})`,
    }

    // Stack title/subtitle upward from the chart's own (dynamic) top edge, rather than from
    // a fixed pixel offset — otherwise they drift away from the chart whenever its height
    // changes (a smaller/thinner chart used to leave the title stranded near the header).
    const GAP_CHART_TO_SUBTITLE = 16
    const SUBTITLE_HEIGHT = 14
    const GAP_SUBTITLE_TO_TITLE = 3 // kept tight — the subtitle should always read as glued to the title
    const TITLE_HEIGHT = 22
    const TITLE_LIFT = 8 // the extra "slightly moved upwards" nudge, requested for the title

    const subtitleTopOffset = chartSize.height / 2 + GAP_CHART_TO_SUBTITLE + TITLE_LIFT + SUBTITLE_HEIGHT
    const titleTopOffset = subtitleTopOffset + GAP_SUBTITLE_TO_TITLE + TITLE_HEIGHT

    const titleStyle = { top: '50%', transform: `translate(0, ${-titleTopOffset})` }
    const subtitleStyle = { top: '50%', transform: `translate(0, ${-subtitleTopOffset})` }

    return (
        <Document>
            <Page size="A4" orientation='landscape' style={{ backgroundColor: C.pageBg, color: C.text }}>
                <View style={[styles.header, { borderBottomColor: C.hairline }]}>
                    <Image src={C.logo} style={styles.logo} />
                </View>

                <View style={styles.main}>
                    <Text style={[styles.title, titleStyle, { color: C.text }]}>{props.title}</Text>
                    <Text style={[styles.subtitle, subtitleStyle, { color: C.sub }]}>{props.subtitle}</Text>
                    <Image src={props.chartImgData} style={chartStyle} />
                </View>

                <View style={[styles.footer, { borderTopColor: C.hairline }]}>
                    <Text style={[styles.footerLeft, { color: C.muted }]}>{props.footerLeft}</Text>
                    <Text style={[styles.footerRight, { color: C.muted }]}>{props.footerRight}</Text>
                </View>
            </Page>
        </Document>
    )
}


export default async function renderPdf(componentProps: ExportProps) {
    return await pdf(<Doc {...componentProps} />).toBlob();
}
