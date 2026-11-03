import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
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
import { ScraperBridgeService } from './services/scraper-bridge.service';
import { ProcessedRow, RowStatus } from './interfaces/processed-row.interface';
import { ExcelFile, ScraperEvent, ScrapeItem } from './interfaces/scraper-api.interface';

type Phase = 'idle' | 'starting' | 'waiting' | 'running';

const ID_PATTERN = /^\d{1,30}$/;

const STATUS_LABEL: Record<RowStatus, string> = {
    pending: 'Pendiente',
    queued: 'En cola',
    processing: 'Buscando',
    found: 'Encontrada',
    'not-found': 'No encontrada',
    error: 'Error',
    skipped: 'Omitida',
};

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
        DatePipe,
        DecimalPipe,
    ],
})
export class AppComponent {
    private readonly api = inject(ScraperBridgeService).api;

    protected readonly hasBridge = this.api !== null;
    protected readonly file = signal<ExcelFile | null>(null);
    protected readonly rows = signal<ProcessedRow[]>([]);
    protected readonly startRow = signal(2);
    protected readonly endRow = signal(2);
    protected readonly phase = signal<Phase>('idle');
    protected readonly confirmMessage = signal('');
    protected readonly logs = signal<{ message: string; timestamp: Date }[]>([]);

    protected readonly busy = computed(() => this.phase() !== 'idle');
    protected readonly idHeader = computed(() => this.file()?.headers[this.file()!.idColumn] ?? '');
    protected readonly firstRow = computed(() => this.rows()[0]?.row ?? 2);
    protected readonly lastRow = computed(() => this.rows().at(-1)?.row ?? 2);
    protected readonly rangeError = computed(() => {
        const [start, end] = [this.startRow(), this.endRow()];
        if (!Number.isInteger(start) || !Number.isInteger(end)) return 'Ingresá números de fila enteros.';
        if (start < this.firstRow() || end > this.lastRow()) return `Las filas van de ${this.firstRow()} a ${this.lastRow()}.`;
        if (start > end) return 'La fila inicial no puede ser mayor que la final.';
        return '';
    });
    protected readonly hasResults = computed(() => this.rows().some(r => r.status === 'found' || r.status === 'not-found' || r.status === 'error'));
    protected readonly progress = computed(() => {
        const inRun = this.rows().filter(r => r.status !== 'pending' && r.status !== 'skipped');
        const done = inRun.filter(r => r.status === 'found' || r.status === 'not-found' || r.status === 'error').length;
        return { done, total: inRun.length, percent: inRun.length ? Math.round((done / inRun.length) * 100) : 0 };
    });
    protected readonly displayedColumns = computed(() => ['row', 'status', ...(this.file()?.headers.slice(0, 4).map((_, i) => `col${i}`) ?? []), 'total', 'message']);

    constructor() {
        if (!this.api) return;
        const unsubscribe = this.api.onEvent(evt => this.onEvent(evt));
        inject(DestroyRef).onDestroy(unsubscribe);
    }

    async openExcel() {
        if (!this.api || this.busy()) return;
        const res = await this.api.openExcel();
        if (!res.ok) return this.addLog(`No se pudo abrir el Excel: ${res.error}`);
        if (res.canceled) return;

        const id = res.idColumn;
        this.file.set(res);
        this.rows.set(res.rows.map(r => ({ row: r.row, id: r.values[id] ?? '', values: r.values, status: 'pending', message: '' })));
        this.startRow.set(this.firstRow());
        this.endRow.set(this.lastRow());
        this.logs.set([]);
        this.addLog(`Archivo cargado: ${res.fileName} (hoja «${res.sheetName}», ${res.rows.length} filas). Columna de números: «${res.headers[id]}».`);
        res.warnings.forEach(w => this.addLog(`⚠️ ${w}`));
    }

    async start() {
        if (!this.api || this.busy() || this.rangeError()) return;
        const [start, end] = [this.startRow(), this.endRow()];
        const items: ScrapeItem[] = [];

        this.rows.update(rows => rows.map(r => {
            if (r.row < start || r.row > end) return r;
            const base = { ...r, data: undefined };
            if (!r.id) return { ...base, status: 'skipped', message: 'Fila sin número de operación' };
            if (!ID_PATTERN.test(r.id)) return { ...base, status: 'error', message: 'Número de operación inválido (solo dígitos). Si Excel lo muestra en notación científica, formateá la columna como texto.' };
            items.push({ row: r.row, id: r.id });
            return { ...base, status: 'queued', message: 'En cola' };
        }));

        if (items.length === 0) return this.addLog('No hay números de operación válidos en el rango elegido.');

        this.phase.set('starting');
        this.addLog(`Iniciando: filas ${start} a ${end}, ${items.length} operaciones.`);
        const res = await this.api.start(items);
        if (!res.ok) {
            this.addLog(`No se pudo iniciar: ${res.error}`);
            this.resetUnfinished('pending', '');
            this.phase.set('idle');
        }
    }

    async confirmReady() {
        if (!this.api) return;
        this.phase.set('running');
        await this.api.confirmReady();
    }

    async cancel() {
        if (!this.api) return;
        this.addLog('Cancelando...');
        await this.api.cancel();
    }

    async save() {
        if (!this.api || this.busy()) return;
        const res = await this.api.saveResults();
        if (!res.ok) return this.addLog(`No se pudo guardar: ${res.error}`);
        if (!res.canceled) this.addLog(`✅ Excel guardado en: ${res.path}`);
    }

    private onEvent(evt: ScraperEvent) {
        switch (evt.type) {
            case 'item': {
                const rows = new Set(evt.rows);
                this.rows.update(list => list.map(r => (rows.has(r.row) ? { ...r, status: evt.status, message: evt.message, data: evt.data } : r)));
                if (evt.status !== 'processing') this.addLog(`Fila ${evt.rows.join(', ')}: ${evt.message}`);
                break;
            }
            case 'waiting-confirmation':
                this.confirmMessage.set(evt.message);
                this.phase.set('waiting');
                break;
            case 'status':
                this.addLog(evt.message);
                break;
            default: // done | cancelled | error
                this.addLog(evt.type === 'error' ? `❌ ${evt.message}` : evt.message);
                this.resetUnfinished('pending', 'No procesada');
                this.phase.set('idle');
        }
    }

    // Las filas que quedaron en cola vuelven a pendiente; los resultados obtenidos se conservan.
    private resetUnfinished(status: RowStatus, message: string) {
        this.rows.update(list => list.map(r => (r.status === 'queued' || r.status === 'processing' ? { ...r, status, message } : r)));
    }

    private addLog(message: string) {
        this.logs.update(l => [...l, { message, timestamp: new Date() }]);
    }

    protected chipClass(status: RowStatus): string {
        return `chip-${status}`;
    }

    protected label(status: RowStatus): string {
        return STATUS_LABEL[status];
    }
}
