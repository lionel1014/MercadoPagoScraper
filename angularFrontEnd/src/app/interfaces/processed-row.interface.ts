export type RowStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'SUCCESS' | 'ERROR' | 'SKIPPED';

export interface ProcessedRow {
    __rowNum__: number;
    status: RowStatus;
    message: string;
    [key: string]: unknown;
}
