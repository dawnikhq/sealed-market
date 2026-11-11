// Browser shims for Node builtins imported by near-api-js / @near-wallet-selector transitive deps

export function format(...args: unknown[]): string {
  return args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
}

export function inherits(ctor: any, superCtor: any) {
  if (superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true,
      },
    });
  }
}

export function deprecate<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}

export class Agent {
  options: Record<string, unknown>;
  constructor(options: Record<string, unknown> = {}) {
    this.options = options;
  }
}

export function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;

export default {
  format,
  inherits,
  deprecate,
  Agent,
  randomBytes,
  TextEncoder,
  TextDecoder,
};
