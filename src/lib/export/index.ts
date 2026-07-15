import type { PdfExportOptions } from "../types";
import renderPdf from "./pdf";


export type ExportProps = { chartImgData: string; chartAspectRatio: number } & PdfExportOptions
export type ExportProvider = (props: ExportProps) => Promise<Blob>

const providers: Map<ProviderKey, ExportProvider> = new Map();
export function registerExportProvider(key: ProviderKey, provider: ExportProvider) {
    if (providers.has(key)) throw new Error("Export provider already registered");
    providers.set(key, provider);
}

export function renderExport(key: ProviderKey, options: ExportProps) {
    const provider = providers.get(key);
    if (!provider) throw new Error("Provider not registered");
    return provider(options);
}


export type ProviderKey = 'pdf';
registerExportProvider('pdf', renderPdf);