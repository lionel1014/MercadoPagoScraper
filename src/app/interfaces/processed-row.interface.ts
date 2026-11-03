import { OperationData } from './scraper-api.interface';

export type RowStatus = 'pending' | 'queued' | 'processing' | 'found' | 'not-found' | 'error' | 'skipped';

export interface ProcessedRow {
    row: number;
    id: string;
    values: string[];
    status: RowStatus;
    message: string;
    data?: OperationData;
}
