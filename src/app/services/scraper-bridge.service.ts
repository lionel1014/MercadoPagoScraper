import { Injectable } from '@angular/core';
import { MpScraperApi } from '../interfaces/scraper-api.interface';

// Acceso al puente seguro de Electron. Es null si la UI corre en un navegador común (ng serve).
@Injectable({ providedIn: 'root' })
export class ScraperBridgeService {
    readonly api: MpScraperApi | null = (globalThis as { mpScraper?: MpScraperApi }).mpScraper ?? null;
}
