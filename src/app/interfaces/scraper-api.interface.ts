// Contrato del puente expuesto por electron/preload.js en window.mpScraper.

export interface OperationData {
    operationId: string | null;
    date: string | null;
    cobro: number | null;
    impuestoCreditosDebitos: number | null;
    retencionesProvinciales: number | null;
    cargoMp: number | null;
    total: number | null;
    medioPago: string | null;
}

export interface ExcelRow {
    row: number;
    values: string[];
}

export interface ExcelFile {
    fileName: string;
    sheetName: string;
    headers: string[];
    idColumn: number;
    rows: ExcelRow[];
    warnings: string[];
}

export interface ScrapeItem {
    row: number;
    id: string;
}

export type ItemStatus = 'processing' | 'found' | 'not-found' | 'error';

export type ScraperEvent =
    | { type: 'status' | 'waiting-confirmation' | 'done' | 'cancelled' | 'error'; message: string }
    | { type: 'item'; rows: number[]; status: ItemStatus; message: string; data?: OperationData };

export type BridgeResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Dialog<T> = BridgeResult<{ canceled: true } | ({ canceled: false } & T)>;

export interface MpScraperApi {
    openExcel(): Promise<Dialog<ExcelFile>>;
    start(items: ScrapeItem[]): Promise<BridgeResult>;
    confirmReady(): Promise<BridgeResult>;
    cancel(): Promise<BridgeResult>;
    saveResults(): Promise<Dialog<{ path: string }>>;
    onEvent(callback: (evt: ScraperEvent) => void): () => void;
}
