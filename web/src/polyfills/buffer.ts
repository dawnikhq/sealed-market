// Browser-compatible Buffer implementation (dual callable with/without `new`, inherits Uint8Array)

function createFrom(
  value: any,
  encodingOrOffset?: any,
  length?: any
): Uint8Array {
  if (typeof value === 'number') {
    const out = new Uint8Array(value);
    Object.setPrototypeOf(out, BrowserBuffer.prototype);
    return out;
  }
  if (typeof value === 'string') {
    const enc = (typeof encodingOrOffset === 'string' ? encodingOrOffset : 'utf8').toLowerCase();
    if (enc === 'hex') {
      const clean = value.replace(/^0x/, '');
      const out = new Uint8Array(Math.floor(clean.length / 2));
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
      }
      Object.setPrototypeOf(out, BrowserBuffer.prototype);
      return out;
    }
    if (enc === 'base64' || enc === 'base64url') {
      const norm =
        enc === 'base64url' ? value.replace(/-/g, '+').replace(/_/g, '/') : value;
      const bin = atob(norm);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
      }
      Object.setPrototypeOf(out, BrowserBuffer.prototype);
      return out;
    }
    const encoded = new TextEncoder().encode(value);
    const out = new Uint8Array(encoded.length);
    out.set(encoded);
    Object.setPrototypeOf(out, BrowserBuffer.prototype);
    return out;
  }

  if (value instanceof ArrayBuffer) {
    const view = new Uint8Array(
      value,
      typeof encodingOrOffset === 'number' ? encodingOrOffset : 0,
      length
    );
    const out = new Uint8Array(view.length);
    out.set(view);
    Object.setPrototypeOf(out, BrowserBuffer.prototype);
    return out;
  }

  if (ArrayBuffer.isView(value)) {
    const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const out = new Uint8Array(view.length);
    out.set(view);
    Object.setPrototypeOf(out, BrowserBuffer.prototype);
    return out;
  }

  const arr = new Uint8Array(value || 0);
  Object.setPrototypeOf(arr, BrowserBuffer.prototype);
  return arr;
}

export function BrowserBuffer(
  arg: any,
  encodingOrOffset?: any,
  length?: any
): any {
  return createFrom(arg, encodingOrOffset, length);
}

Object.setPrototypeOf(BrowserBuffer.prototype, Uint8Array.prototype);
Object.setPrototypeOf(BrowserBuffer, Uint8Array);

BrowserBuffer.from = function (
  value: any,
  encodingOrOffset?: any,
  length?: any
): any {
  return createFrom(value, encodingOrOffset, length);
};

BrowserBuffer.alloc = function (size: number, fill?: number | string): any {
  const out = new Uint8Array(size);
  if (fill !== undefined) {
    out.fill(typeof fill === 'number' ? fill : 0);
  }
  Object.setPrototypeOf(out, BrowserBuffer.prototype);
  return out;
};

BrowserBuffer.allocUnsafe = function (size: number): any {
  const out = new Uint8Array(size);
  Object.setPrototypeOf(out, BrowserBuffer.prototype);
  return out;
};

BrowserBuffer.allocUnsafeSlow = function (size: number): any {
  const out = new Uint8Array(size);
  Object.setPrototypeOf(out, BrowserBuffer.prototype);
  return out;
};

BrowserBuffer.isBuffer = function (obj: unknown): boolean {
  return obj instanceof Uint8Array;
};

BrowserBuffer.concat = function (list: Uint8Array[], totalLength?: number): any {
  const len =
    totalLength !== undefined
      ? totalLength
      : list.reduce((acc, item) => acc + item.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const item of list) {
    if (offset + item.length > len) {
      out.set(item.subarray(0, len - offset), offset);
      break;
    }
    out.set(item, offset);
    offset += item.length;
  }
  Object.setPrototypeOf(out, BrowserBuffer.prototype);
  return out;
};

BrowserBuffer.byteLength = function (str: string | Uint8Array): number {
  if (typeof str !== 'string') return str.byteLength;
  return new TextEncoder().encode(str).byteLength;
};

BrowserBuffer.prototype.toString = function (
  this: Uint8Array,
  encoding = 'utf8',
  start = 0,
  end?: number
): string {
  const sub = this.subarray(start, end ?? this.length);
  const enc = encoding.toLowerCase();
  if (enc === 'hex') {
    return Array.from(sub)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  if (enc === 'base64') {
    let binary = '';
    for (let i = 0; i < sub.length; i++) {
      binary += String.fromCharCode(sub[i]);
    }
    return btoa(binary);
  }
  return new TextDecoder().decode(sub);
};

BrowserBuffer.prototype.slice = function (
  this: Uint8Array,
  start?: number,
  end?: number
): any {
  const sub = Uint8Array.prototype.subarray.call(this, start, end);
  Object.setPrototypeOf(sub, BrowserBuffer.prototype);
  return sub;
};

export const Buffer = BrowserBuffer;
export const SlowBuffer = BrowserBuffer;
export const kMaxLength = 0x7fffffff;

if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = BrowserBuffer;
  (globalThis as any).global = globalThis;
  if (!(globalThis as any).process) {
    (globalThis as any).process = { env: {}, browser: true, version: 'v22.0.0' };
  }
}

export default {
  Buffer: BrowserBuffer,
  SlowBuffer: BrowserBuffer,
  kMaxLength,
};
