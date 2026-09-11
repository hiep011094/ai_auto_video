import { toBlobURL } from '@ffmpeg/util';

const MSG = {
  LOAD: 'LOAD', EXEC: 'EXEC', WRITE_FILE: 'WRITE_FILE',
  READ_FILE: 'READ_FILE', DELETE_FILE: 'DELETE_FILE',
  ERROR: 'ERROR', LOG: 'LOG', PROGRESS: 'PROGRESS',
} as const;

class FFmpegService {
  private worker: Worker | null = null;
  private loaded = false;
  private msgId = 0;
  private callbacks = new Map<number, {
    resolve: (v: any) => void;
    reject: (e: any) => void;
  }>();
  private logCb: ((msg: string) => void) | null = null;
  private progressCb: ((p: { progress: number }) => void) | null = null;

  isLoaded() {
    return this.loaded;
  }

  async load(onLog?: (msg: string) => void) {
    if (this.loaded && this.worker) return;
    this.logCb = onLog || null;

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

    const workerBlob = this.buildWorkerBlob();
    this.worker = new Worker(workerBlob);

    this.worker.onmessage = ({ data: { id, type, data } }) => {
      if (type === MSG.LOG) {
        this.logCb?.(data?.message || '');
        return;
      }
      if (type === MSG.PROGRESS) {
        this.progressCb?.(data);
        return;
      }
      if (type === MSG.ERROR) {
        const cb = this.callbacks.get(id);
        if (cb) { this.callbacks.delete(id); cb.reject(new Error(data)); }
        return;
      }
      const cb = this.callbacks.get(id);
      if (cb) { this.callbacks.delete(id); cb.resolve(data); }
    };

    await this.send(MSG.LOAD, { coreURL, wasmURL });
    this.loaded = true;
  }

  private send(type: string, data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, data });
    });
  }

  private buildWorkerBlob(): string {
    const script = `
var MSG = {
  LOAD: "LOAD", EXEC: "EXEC",
  WRITE_FILE: "WRITE_FILE", READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE", ERROR: "ERROR",
  LOG: "LOG", PROGRESS: "PROGRESS",
};

var ffmpeg = null;

var load = function(opts) {
  importScripts(opts.coreURL);
  return self.createFFmpegCore({
    mainScriptUrlOrBlob: opts.coreURL + "#" + btoa(JSON.stringify({ wasmURL: opts.wasmURL })),
  }).then(function(core) {
    ffmpeg = core;
    ffmpeg.setLogger(function(data) { self.postMessage({ type: MSG.LOG, data: data }); });
    ffmpeg.setProgress(function(data) { self.postMessage({ type: MSG.PROGRESS, data: data }); });
    return true;
  });
};

self.onmessage = function(e) {
  var id = e.data.id;
  var type = e.data.type;
  var _data = e.data.data;
  var trans = [];
  var data;

  var handleResult = function(result) {
    data = result;
    if (data instanceof Uint8Array) trans.push(data.buffer);
    self.postMessage({ id: id, type: type, data: data }, trans);
  };

  var handleError = function(err) {
    self.postMessage({ id: id, type: MSG.ERROR, data: err.toString() });
  };

  try {
    if (type !== MSG.LOAD && !ffmpeg) { handleError(new Error("ffmpeg is not loaded")); return; }
    switch (type) {
      case MSG.LOAD: load(_data).then(handleResult).catch(handleError); return;
      case MSG.EXEC:
        ffmpeg.setTimeout(_data.timeout || -1);
        ffmpeg.exec.apply(ffmpeg, _data.args);
        data = ffmpeg.ret;
        ffmpeg.reset();
        break;
      case MSG.WRITE_FILE: ffmpeg.FS.writeFile(_data.path, _data.data); data = true; break;
      case MSG.READ_FILE: data = ffmpeg.FS.readFile(_data.path); break;
      case MSG.DELETE_FILE: ffmpeg.FS.unlink(_data.path); data = true; break;
      default: handleError(new Error("unknown type: " + type)); return;
    }
  } catch (err) { handleError(err); return; }
  if (data instanceof Uint8Array) trans.push(data.buffer);
  self.postMessage({ id: id, type: type, data: data }, trans);
};
`;
    return URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
  }

  async exec(args: string[]) { return this.send(MSG.EXEC, { args, timeout: -1 }); }
  async writeFile(name: string, data: Uint8Array | any) { return this.send(MSG.WRITE_FILE, { path: name, data }); }
  async readFile(name: string) { return this.send(MSG.READ_FILE, { path: name }); }
  async deleteFile(name: string) { return this.send(MSG.DELETE_FILE, { path: name }); }
  onProgress(cb: (p: { progress: number }) => void) { this.progressCb = cb; }
}

export const ffmpegService = new FFmpegService();