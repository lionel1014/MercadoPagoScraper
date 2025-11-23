export type RowStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR' | 'SKIPPED';

export interface ProcessedRow {
    __rowNum__: number;
    status: RowStatus;
    message: string;
    [key: string]: any;
}
