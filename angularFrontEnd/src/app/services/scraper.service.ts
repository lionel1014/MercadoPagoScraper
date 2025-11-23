import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ScraperService {
    private ipcRenderer: any;
    private progressSubject = new Subject<any>();
    private completeSubject = new Subject<any>();
    private errorSubject = new Subject<any>();

    constructor(private zone: NgZone) {
        if ((window as any).require) {
            try {
                this.ipcRenderer = (window as any).require('electron').ipcRenderer;

                this.ipcRenderer.on('scraping-progress', (event: any, data: any) => {
                    this.zone.run(() => {
                        this.progressSubject.next(data);
                    });
                });

                this.ipcRenderer.on('scraping-complete', (event: any, data: any) => {
                    this.zone.run(() => {
                        this.completeSubject.next(data);
                    });
                });

                this.ipcRenderer.on('scraping-error', (event: any, data: any) => {
                    this.zone.run(() => {
                        this.errorSubject.next(data);
                    });
                });

            } catch (e) {
                console.error('Electron ipcRenderer could not be loaded', e);
            }
        } else {
            console.warn('Electron ipcRenderer not available');
        }
    }

    public scrape(authIds: string[], showBrowser: boolean): void {
        if (this.ipcRenderer) {
            this.ipcRenderer.send('start-scraping', { authIds, showBrowser });
        } else {
            console.error('Cannot scrape: Electron not available');
        }
    }

    public get onProgress(): Observable<any> {
        return this.progressSubject.asObservable();
    }

    public get onComplete(): Observable<any> {
        return this.completeSubject.asObservable();
    }

    public get onError(): Observable<any> {
        return this.errorSubject.asObservable();
    }
}
