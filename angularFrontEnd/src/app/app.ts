import { Component, ViewChild, ElementRef, signal, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ExcelService } from './services/excel.service';
import { ProcessedRow } from './interfaces/processed-row.interface';

@Component({
    selector: 'app-root',
    templateUrl: './app.html',
    styleUrls: ['./app.css'],
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatToolbarModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatTableModule,
        MatProgressBarModule,
        MatCardModule,
        MatChipsModule,
        MatSlideToggleModule
    ]
})
export class AppComponent {
    @ViewChild('fileInput') fileInput!: ElementRef;

    // Signals
    private fileSig: WritableSignal<File | null> = signal<File | null>(null);
    private headersSig: WritableSignal<string[]> = signal<string[]>([]);
    private dataSig: WritableSignal<ProcessedRow[]> = signal<ProcessedRow[]>([]);
    private displayedColumnsSig: WritableSignal<string[]> = signal<string[]>([]);

    private startRowSig: WritableSignal<number> = signal<number>(2);
    private isProcessingSig: WritableSignal<boolean> = signal<boolean>(false);

    // Log structure
    private logsSig: WritableSignal<{ message: string, timestamp: Date }[]> = signal<{ message: string, timestamp: Date }[]>([]);

    private showBrowserSig: WritableSignal<boolean> = signal<boolean>(false);

    constructor(private excelService: ExcelService) {}

    // Expose as properties for template compatibility
    get file() { return this.fileSig(); }
    set file(v: File | null) { this.fileSig.set(v); }

    get headers() { return this.headersSig(); }
    get data() { return this.dataSig(); }
    get displayedColumns() { return this.displayedColumnsSig(); }

    get startRow() { return this.startRowSig(); }
    set startRow(v: number) { this.startRowSig.set(v); }

    get isProcessing() { return this.isProcessingSig(); }

    get logs() { return this.logsSig(); }

    get showBrowser() { return this.showBrowserSig(); }
    set showBrowser(v: boolean) { this.showBrowserSig.set(v); }

    private addLog(message: string) {
        this.logsSig.update(l => [...l, { message, timestamp: new Date() }]);
    }

    openFileDialog() {
        this.fileInput.nativeElement.click();
    }

    onFileSelected(event: Event) {
        const target = event.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
            this.handleFile(target.files[0]);
            // Reset input para permitir seleccionar el mismo archivo nuevamente
            target.value = '';
        }
    }

    async handleFile(file: File) {
        try {
            this.addLog(`Leyendo archivo: ${file.name}...`);
            const result = await this.excelService.parseExcel(file);
            this.headersSig.set(result.headers);
            this.dataSig.set(result.data);
            this.fileSig.set(file);

            // Setup table columns (RowNum + Status + First 4 excel columns + Message)
            this.displayedColumnsSig.set(['__rowNum__', 'status', ...this.headersSig().slice(0, 4), 'message']);

            this.addLog(`Archivo cargado. ${this.dataSig().length} filas detectadas.`);
        } catch (error) {
            console.error(error);
            this.addLog(`Error al leer el archivo.`);
        }
    }

    reset() {
        this.fileSig.set(null);
        this.dataSig.set([]);
        this.headersSig.set([]);
        this.logsSig.set([]);
        this.startRowSig.set(2);
        this.isProcessingSig.set(false);
    }

    async startScraping() {
        if (this.isProcessingSig()) return;
        this.isProcessingSig.set(true);
        this.addLog('--- INICIANDO PROCESO ---');

        const startIndex = this.dataSig().findIndex(row => row.__rowNum__ >= this.startRowSig());

        if (startIndex === -1) {
            this.addLog('Error: Número de línea inicial no válido.');
            this.isProcessingSig.set(false);
            return;
        }

        // Mark previous as skipped
        this.dataSig.update(prev => {
            const next = prev.slice();
            for (let i = 0; i < startIndex; i++) {
                next[i].status = 'SKIPPED';
            }
            return next;
        });

        // Get AuthIds to scrape
        const headers = this.headersSig();
        let authIdCol = headers.find(h => h.toUpperCase().includes('REFERENCIA') || h.toUpperCase().includes('OPERATION'));
        if (!authIdCol && headers.length > 0) authIdCol = headers[0];

        if (!authIdCol) {
            this.addLog('Error: No se encontró columna de referencia.');
            this.isProcessingSig.set(false);
            return;
        }

        this.addLog(`Usando columna '${authIdCol}' como referencia.`);

        const rowsToProcess = this.dataSig().slice(startIndex);
        const authIds = rowsToProcess.map(row => row[authIdCol!]?.toString().trim()).filter(id => id);

        if (authIds.length === 0) {
            this.addLog('Advertencia: No se encontraron IDs para procesar.');
            this.isProcessingSig.set(false);
            return;
        }

        this.addLog(`Enviando ${authIds.length} operaciones al scraper...`);
        console.log('AuthIds:', authIds);
    }

    download() {
        this.excelService.exportToExcel(this.dataSig(), `Reporte_MP_${new Date().getTime()}.xlsx`);
    }

    clearLogs() {
        this.logsSig.set([]);
        this.addLog('Logs limpiados.');
    }

    // Helper for row styling
    getRowClass(row: ProcessedRow): string {
        return `row-${row.status.toLowerCase()}`;
    }
}
