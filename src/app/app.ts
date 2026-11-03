import { Component, ElementRef, signal, ChangeDetectionStrategy, viewChild } from '@angular/core';
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
import { DatePipe } from '@angular/common';
import { ExcelService } from './services/excel.service';
import { ProcessedRow, RowStatus } from './interfaces/processed-row.interface';
import { ScrapingProgress, ScrapingResult, ScrapingError, ScrapingResultItem } from './interfaces/scraping.interface';
import { IpcRendererEvent, IpcRendererLike } from './interfaces/ipc.interface';

@Component({
    selector: 'app-root',
    templateUrl: './app.html',
    styleUrls: ['./app.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
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
        MatSlideToggleModule,
        DatePipe
    ]
})
export class AppComponent {
    protected readonly fileInput = viewChild<ElementRef>('fileInput');

    // Signals for state management
    protected readonly fileSig = signal<File | null>(null);
    protected readonly headersSig = signal<string[]>([]);
    protected readonly dataSig = signal<ProcessedRow[]>([]);
    protected readonly displayedColumnsSig = signal<string[]>([]);
    protected readonly startRowSig = signal<number>(2);
    protected readonly isProcessingSig = signal<boolean>(false);
    protected readonly logsSig = signal<{ message: string; timestamp: Date }[]>([]);
    protected readonly showBrowserSig = signal<boolean>(true);
    protected readonly showConfirmationModalSig = signal<boolean>(false);

    // Expose as public getters for template compatibility
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
    get showConfirmationModal() { return this.showConfirmationModalSig(); }
    set showConfirmationModal(v: boolean) { this.showConfirmationModalSig.set(v); }

    constructor(private excelService: ExcelService) {
        // Configurar listeners de IPC para Electron
        const ipcRenderer = this.getIpcRenderer();

        if (ipcRenderer) {
            ipcRenderer.on('scraping-progress', (event: IpcRendererEvent, data?: unknown) => {
                const payload = data as ScrapingProgress | undefined;
                if (payload) this.addLog(payload.message);
                if (payload?.success !== undefined) {
                    this.updateRowStatus(payload.message, !!payload.success);
                }
            });

            ipcRenderer.on('scraping-complete', (event: IpcRendererEvent, data?: unknown) => {
                const payload = data as ScrapingResult | undefined;
                const results = payload?.results ?? [];
                this.addLog(`--- PROCESO COMPLETADO: ${results.length} resultados obtenidos ---`);
                this.processResults(results);
                this.isProcessingSig.set(false);
            });

            ipcRenderer.on('scraping-error', (event: IpcRendererEvent, data?: unknown) => {
                const payload = data as ScrapingError | undefined;
                if (payload) this.addLog(`ERROR: ${payload.message}`);
                this.isProcessingSig.set(false);
                this.showConfirmationModalSig.set(false);
            });

            ipcRenderer.on('scraping-cancelled', (event: IpcRendererEvent, data?: unknown) => {
                const payload = data as { message: string } | undefined;
                if (payload) this.addLog(`CANCELADO: ${payload.message}`);
                this.isProcessingSig.set(false);
                this.showConfirmationModalSig.set(false);

                // Restaurar estado de las filas cuando se recibe la confirmación de cancelación
                this.dataSig.update(prev => prev.map(row => (row.status === 'PROCESSING' || row.status === 'PENDING' || row.status === 'SKIPPED') ? { ...row, status: 'PENDING' as RowStatus, message: '' } : row));
            });

            ipcRenderer.on('browser-closed', (event: IpcRendererEvent, data?: unknown) => {
                const payload = data as { message: string } | undefined;
                if (payload) this.addLog(`⚠️ ${payload.message}`);
                this.isProcessingSig.set(false);
                this.showConfirmationModalSig.set(false);

                // Restaurar estado de las filas cuando el navegador se cierra
                this.dataSig.update(prev => prev.map(row => (row.status === 'PROCESSING' || row.status === 'PENDING' || row.status === 'SKIPPED') ? { ...row, status: 'PENDING' as RowStatus, message: '' } : row));
            });

            ipcRenderer.on('waiting-for-confirmation', (event: IpcRendererEvent, data?: unknown) => {
                const payload = data as { message: string } | undefined;
                if (payload) this.addLog(payload.message);
                this.showConfirmationModalSig.set(true);
            });
        }
    }

    confirmReady() {
        const ipcRenderer = this.getIpcRenderer();
        if (ipcRenderer) {
            ipcRenderer.send('user-confirmed', { confirmed: true });
            this.showConfirmationModalSig.set(false);
            this.addLog('Confirmación enviada. Continuando con el scraping...');
        }
    }

    cancelScraping() {
        const ipcRenderer = this.getIpcRenderer();
        if (ipcRenderer) {
            ipcRenderer.send('cancel-scraping', { cancelled: true });
            this.showConfirmationModalSig.set(false);
            this.addLog('Proceso cancelado por el usuario.');

            // Restaurar estado de las filas a su estado original
            this.dataSig.update(prev => {
                return prev.map(row => {
                    // Restaurar todas las filas que fueron modificadas durante el proceso
                    if (row.status === 'PROCESSING' || row.status === 'PENDING' || row.status === 'SKIPPED') {
                        return {
                            ...row,
                            status: 'PENDING' as RowStatus,
                            message: ''
                        };
                    }
                    return row;
                });
            });

            // Detener el procesamiento
            this.isProcessingSig.set(false);
        }
    }

    private addLog(message: string) {
        this.logsSig.update(l => [...l, { message, timestamp: new Date() }]);
    }

    openFileDialog() {
        this.fileInput()?.nativeElement.click();
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
        let authIdCol = headers.find(h => h && typeof h === 'string' && (h.toUpperCase().includes('REFERENCIA') || h.toUpperCase().includes('OPERATION')));
        if (!authIdCol && headers.length > 0) {
            // Buscar el primer header válido (no null/undefined)
            authIdCol = headers.find(h => h && typeof h === 'string');
        }

        if (!authIdCol) {
            this.addLog('Error: No se encontró columna de referencia.');
            this.isProcessingSig.set(false);
            return;
        }

        this.addLog(`Usando columna '${authIdCol}' como referencia.`);

        const rowsToProcess = this.dataSig().slice(startIndex);
        // Filtrar filas vacías y obtener solo los authIds válidos
        const authIds = rowsToProcess
            .map(row => {
                const value = row[authIdCol!];
                // Validar que el valor existe y no está vacío
                if (value === null || value === undefined || value === '') {
                    return null;
                }
                const trimmed = value.toString().trim();
                return trimmed.length > 0 ? trimmed : null;
            })
            .filter(id => id !== null && id !== undefined && id !== '') as string[];

        if (authIds.length === 0) {
            this.addLog('Advertencia: No se encontraron IDs para procesar.');
            this.isProcessingSig.set(false);
            return;
        }

        this.addLog(`Enviando ${authIds.length} operaciones al scraper...`);
        console.log('AuthIds:', authIds);

        // Marcar filas como procesando (solo las que tienen authId válido)
        this.dataSig.update(prev => {
            return prev.map((row, idx) => {
                if (idx >= startIndex) {
                    const rowAuthIdValue = row[authIdCol!];
                    // Solo marcar como PROCESSING si tiene un authId válido
                    if (rowAuthIdValue && rowAuthIdValue !== null && rowAuthIdValue !== undefined && rowAuthIdValue !== '') {
                        const rowAuthId = rowAuthIdValue.toString().trim();
                        if (rowAuthId && rowAuthId.length > 0 && authIds.includes(rowAuthId)) {
                            return { ...row, status: 'PROCESSING', message: 'En cola...' };
                        } else if (rowAuthId.length === 0) {
                            // Marcar filas vacías como SKIPPED
                            return { ...row, status: 'SKIPPED', message: 'Fila vacía - sin número de autorización' };
                        }
                    } else {
                        // Marcar filas sin valor como SKIPPED
                        return { ...row, status: 'SKIPPED', message: 'Fila vacía - sin número de autorización' };
                    }
                }
                return row;
            });
        });

        // Enviar a Electron para procesar
        const ipcRenderer = this.getIpcRenderer();
        if (ipcRenderer) {
            this.addLog('Enviando datos a Puppeteer...');
            console.log('Enviando IPC con:', {
                authIdsCount: authIds.length
            });

            ipcRenderer.send('start-scraping', {
                authIds,
                showBrowser: true
            });

            this.addLog('Mensaje enviado. El navegador se abrirá automáticamente...');
        } else {
            this.addLog('ERROR: No se puede comunicar con Electron. Asegúrate de ejecutar la aplicación usando: npm run electron');
            this.isProcessingSig.set(false);
        }
    }

    private getIpcRenderer(): IpcRendererLike | null {
        if (typeof window !== 'undefined') {
            const w = window as unknown as { require?: (m: string) => unknown };
            if (typeof w.require === 'function') {
                try {
                    const electron = w.require('electron') as { ipcRenderer?: IpcRendererLike } | undefined;
                    return electron?.ipcRenderer ?? null;
                } catch (e) {
                    console.warn('Electron no está disponible:', e);
                    return null;
                }
            }
        }
        return null;
    }

    private updateRowStatus(message: string, success: boolean) {
        // Extraer authId del mensaje - buscar el número completo que está siendo procesado
        // El mensaje viene como: "[1/32] Buscando operación: 17113245" o "[1/32] ✓ Encontrado: 17113245"
        const authIdMatch = message.match(/: (\d+)/);
        if (authIdMatch) {
            const authId = authIdMatch[1];

            // Obtener la columna de autorización
            const headers = this.headersSig();
            let authIdCol = headers.find(h => h && typeof h === 'string' && (h.toUpperCase().includes('REFERENCIA') || h.toUpperCase().includes('OPERATION')));
            if (!authIdCol && headers.length > 0) {
                authIdCol = headers.find(h => h && typeof h === 'string');
            }

            if (authIdCol) {
                this.dataSig.update(prev => {
                    return prev.map(row => {
                        // Comparar exactamente el valor de la columna con el authId
                        const rowAuthIdValue = row[authIdCol!];
                        if (rowAuthIdValue) {
                            const rowAuthId = rowAuthIdValue.toString().trim();
                            // Solo actualizar si coincide EXACTAMENTE
                            if (rowAuthId === authId) {
                                return {
                                    ...row,
                                    status: success ? 'SUCCESS' : 'ERROR',
                                    message: message
                                };
                            }
                        }
                        return row;
                    });
                });
            }
        }
    }

    private processResults(results: ScrapingResultItem[]) {
        // Mapear resultados a las filas correspondientes
        const headers = this.headersSig();
        if (!headers || headers.length === 0) return;

        let authIdCol = headers.find(h => h && typeof h === 'string' && (h.toUpperCase().includes('REFERENCIA') || h.toUpperCase().includes('OPERATION')));
        if (!authIdCol && headers.length > 0) {
            // Buscar el primer header válido (no null/undefined)
            authIdCol = headers.find(h => h && typeof h === 'string');
        }

        if (!authIdCol) return;

        this.dataSig.update(prev => {
            return prev.map(row => {
                // Validar que la fila tenga el campo de autorización
                const rowAuthIdValue = row[authIdCol!];
                if (!rowAuthIdValue || rowAuthIdValue === null || rowAuthIdValue === undefined || rowAuthIdValue === '') {
                    // Si la fila no tiene autorización, marcarla como SKIPPED
                    if (row.status === 'PROCESSING' || row.status === 'PENDING') {
                        return {
                            ...row,
                            status: 'SKIPPED' as RowStatus,
                            message: 'Fila vacía - sin número de autorización'
                        };
                    }
                    return row;
                }

                const rowAuthId = rowAuthIdValue.toString().trim();
                if (!rowAuthId || rowAuthId.length === 0) {
                    // Si el valor está vacío después de trim, también saltarlo
                    if (row.status === 'PROCESSING' || row.status === 'PENDING') {
                        return {
                            ...row,
                            status: 'SKIPPED' as RowStatus,
                            message: 'Fila vacía - sin número de autorización'
                        };
                    }
                    return row;
                }

                const result = results.find(r => r && r.authId && r.authId.toString().trim() === rowAuthId);

                if (result) {
                    const updatedRow = { ...row };
                    updatedRow.status = 'SUCCESS' as RowStatus;
                    updatedRow.message = `OK - Total: $${result.Total || 0}`;

                    if (result.OperationId) updatedRow['OperationId'] = result.OperationId;
                    if (result.DateIso) updatedRow['DateIso'] = result.DateIso;
                    if (result.Cobro) updatedRow['Cobro'] = result.Cobro;
                    if (result.Total) updatedRow['Total'] = result.Total;
                    if (result.MedioPago) updatedRow['MedioPago'] = result.MedioPago;

                    return updatedRow;
                } else if (row.status === 'PENDING' || row.status === 'PROCESSING') {
                    return {
                        ...row,
                        status: 'ERROR',
                        message: 'No se encontró información'
                    };
                }
                return row;
            });
        });
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
