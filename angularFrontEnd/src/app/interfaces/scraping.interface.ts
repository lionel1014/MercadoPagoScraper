export interface ScrapingProgress { message: string; success?: boolean }

export interface ScrapingResultItem {
    authId?: string;
    Total?: number;
    OperationId?: string;
    DateIso?: string;
    Cobro?: number;
    MedioPago?: string;
    [key: string]: unknown;
}

export interface ScrapingResult { results: ScrapingResultItem[] }

export interface ScrapingError { message: string }
