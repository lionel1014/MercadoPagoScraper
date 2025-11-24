export type IpcRendererEvent = unknown;

export type IpcRendererLike = {
    on: (channel: string, listener: (event: IpcRendererEvent, data?: unknown) => void) => void;
    once: (channel: string, listener: (event: IpcRendererEvent, data?: unknown) => void) => void;
    send: (channel: string, ...args: unknown[]) => void;
    removeListener?: (channel: string, listener: (...args: unknown[]) => void) => void;
};
