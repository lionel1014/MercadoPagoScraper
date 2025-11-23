import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { ProcessedRow } from '../interfaces/processed-row.interface';

export interface ParseExcelResult {
    headers: string[];
    data: ProcessedRow[];
}

@Injectable({
    providedIn: 'root'
})
export class ExcelService {

    constructor() { }

    public parseExcel(file: File): Promise<ParseExcelResult> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e: ProgressEvent<FileReader>) => {
                try {
                    const data = reader.result as ArrayBuffer;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                    if (!jsonData || jsonData.length === 0) {
                        resolve({ headers: [], data: [] });
                        return;
                    }

                    const headers = jsonData[0] as string[];
                    const rawRows = jsonData.slice(1);

                    const processedData: ProcessedRow[] = rawRows.map((row, index) => {
                        const rowObject: ProcessedRow = {
                            __rowNum__: index + 2,
                            status: 'PENDING',
                            message: ''
                        };

                        headers.forEach((header, i) => {
                            rowObject[header] = row[i];
                        });

                        return rowObject;
                    });

                    resolve({ headers, data: processedData });
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }

    public exportToExcel(data: ProcessedRow[], fileName: string): void {
        const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
        const wb: XLSX.WorkBook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
        XLSX.writeFile(wb, fileName);
    }
}
