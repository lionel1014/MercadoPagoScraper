import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app';
import { ScraperBridgeService } from './services/scraper-bridge.service';
import { ExcelFile, MpScraperApi, ScraperEvent } from './interfaces/scraper-api.interface';

const EXCEL: ExcelFile = {
    fileName: 'cobros.xlsx',
    sheetName: 'Hoja1',
    headers: ['Fecha', 'Referencia'],
    idColumn: 1,
    warnings: ['Este Excel tiene gráficos.'],
    rows: [
        { row: 2, values: ['01/01', '111'] },
        { row: 3, values: ['02/01', ''] },
        { row: 4, values: ['03/01', '12a'] },
        { row: 5, values: ['04/01', '222'] },
        { row: 6, values: ['05/01', '333'] },
    ],
};

function fakeApi() {
    let listener: (evt: ScraperEvent) => void = () => undefined;
    const api = jasmine.createSpyObj<MpScraperApi>('api', ['openExcel', 'start', 'confirmReady', 'cancel', 'saveResults', 'onEvent']);
    api.openExcel.and.resolveTo({ ok: true, canceled: false, ...EXCEL });
    api.start.and.resolveTo({ ok: true });
    api.confirmReady.and.resolveTo({ ok: true });
    api.cancel.and.resolveTo({ ok: true });
    api.saveResults.and.resolveTo({ ok: true, canceled: false, path: 'C:\\x\\res.xlsx' });
    api.onEvent.and.callFake(cb => { listener = cb; return () => undefined; });
    return { api, emit: (evt: ScraperEvent) => listener(evt) };
}

describe('AppComponent', () => {
    let fixture: ComponentFixture<AppComponent>;
    let fake: ReturnType<typeof fakeApi>;
    // Acceso a miembros protegidos para la prueba.
    let app: AppComponent & Record<string, never>;
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    async function setup(api: MpScraperApi | null) {
        await TestBed.configureTestingModule({
            imports: [AppComponent],
            providers: [provideZonelessChangeDetection(), { provide: ScraperBridgeService, useValue: { api } }],
        }).compileComponents();
        fixture = TestBed.createComponent(AppComponent);
        app = fixture.componentInstance as AppComponent & Record<string, never>;
        await fixture.whenStable();
    }

    it('avisa si no corre dentro de la aplicación de escritorio', async () => {
        await setup(null);
        expect(text()).toContain('aplicación de escritorio');
    });

    describe('con el puente de Electron', () => {
        beforeEach(async () => {
            fake = fakeApi();
            await setup(fake.api);
            await app['openExcel']();
            await fixture.whenStable();
        });

        it('carga el Excel, propone todo el rango y muestra advertencias', () => {
            expect(app['startRow']()).toBe(2);
            expect(app['endRow']()).toBe(6);
            expect(text()).toContain('cobros.xlsx');
            expect(text()).toContain('gráficos');
        });

        it('valida el rango de filas', () => {
            app['startRow'].set(5);
            app['endRow'].set(3);
            expect(app['rangeError']()).toContain('mayor');
            app['endRow'].set(9);
            expect(app['rangeError']()).toContain('van de 2 a 6');
        });

        it('envía solo las filas del rango con número válido', async () => {
            app['endRow'].set(5);
            await app['start']();
            expect(fake.api.start).toHaveBeenCalledOnceWith([{ row: 2, id: '111' }, { row: 5, id: '222' }]);
            const status = Object.fromEntries(app['rows']().map(r => [r.row, r.status]));
            expect(status).toEqual({ 2: 'queued', 3: 'skipped', 4: 'error', 5: 'queued', 6: 'pending' });
        });

        it('exige «Ya estoy lista», aplica resultados por fila y conserva parciales al cancelar', async () => {
            await app['start']();
            fake.emit({ type: 'waiting-confirmation', message: 'Iniciá sesión.' });
            await fixture.whenStable();
            expect(text()).toContain('Ya estoy lista');
            expect(fake.api.confirmReady).not.toHaveBeenCalled();

            const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.includes('Ya estoy lista'));
            button!.click();
            expect(fake.api.confirmReady).toHaveBeenCalled();

            const data = { operationId: '111', date: null, cobro: 10, impuestoCreditosDebitos: 0, retencionesProvinciales: null, cargoMp: -1, total: 9, medioPago: 'Débito' };
            fake.emit({ type: 'item', rows: [2], status: 'found', message: 'Encontrada', data });
            fake.emit({ type: 'cancelled', message: 'Proceso cancelado.' });
            await fixture.whenStable();

            const byRow = Object.fromEntries(app['rows']().map(r => [r.row, r]));
            expect(byRow[2].status).toBe('found');
            expect(byRow[2].data?.total).toBe(9);
            expect(byRow[5].status).toBe('pending');
            expect(app['phase']()).toBe('idle');
            expect(app['hasResults']()).toBeTrue();

            await app['save']();
            await fixture.whenStable();
            expect(fake.api.saveResults).toHaveBeenCalled();
            expect(text()).toContain('res.xlsx');
        });

        it('muestra el error si no puede iniciar', async () => {
            fake.api.start.and.resolveTo({ ok: false, error: 'Primero elegí un Excel.' });
            await app['start']();
            await fixture.whenStable();
            expect(text()).toContain('Primero elegí un Excel.');
            expect(app['phase']()).toBe('idle');
            expect(app['rows']().every(r => r.status !== 'queued')).toBeTrue();
        });
    });
});
