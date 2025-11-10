/*
  These error types are to be propagated throughout the backend. Every consumer of a function that returns
  a BoxedResponse needs to properly handle the consumed functions error types. This pattern is one of the
  hardcoded rules of our code structure design patterns, this MUST be followed.
*/

export interface IBoxedError<E extends string | number> {
  status: false;
  errorType: E;
  message?: string;

  // required, not optional
  unwrap(): never;
  unwrapOr<T>(fallback: T): T;
  unwrapOrElse<T>(f: (err: IBoxedError<E>) => T): T;
  expect<T>(msg: string): never;

  map<U>(f: (t: never) => U): BoxedResponse<U, E>;
  mapErr<F extends string | number>(
    f: (err: IBoxedError<E>) => { errorType: F; message?: string } | F
  ): BoxedResponse<never, F>;
  andThen<U>(f: (t: never) => BoxedResponse<U, E>): BoxedResponse<U, E>;
  orElse<U>(
    f: (err: IBoxedError<E>) => BoxedResponse<U, E>
  ): BoxedResponse<U, E>;

  toNullable<T>(): null;

  isOk(): this is never;
  isErr(): this is IBoxedError<E>;
}

export interface IBoxedSuccess<T, E extends string | number> {
  status: true;
  data: T;

  // required, not optional
  unwrap(): T;
  unwrapOr(fallback: T): T;
  unwrapOrElse(f: (err: IBoxedError<E>) => T): T;
  expect(msg: string): T;

  map<U>(f: (t: T) => U): BoxedResponse<U, E>;
  mapErr<F extends string | number>(
    _f: (err: never) => { errorType: F; message?: string } | F
  ): BoxedResponse<T, F>;
  andThen<U, E2 extends string | number>(
    f: (t: T) => BoxedResponse<U, E2>
  ): BoxedResponse<U, E2>;
  orElse(_f: (err: IBoxedError<E>) => BoxedResponse<T, E>): BoxedResponse<T, E>;

  toNullable(): T;

  isOk(): this is IBoxedSuccess<T, E>;
  isErr(): this is never;
}

/** A union that can be either an error or a success */
export type BoxedResponse<T, E extends string | number> =
  | IBoxedError<E>
  | IBoxedSuccess<T, E>;

/** A class implementing the error shape */
export class BoxedError<E extends string | number> implements IBoxedError<E> {
  public status: false = false;
  public errorType: E;
  public message?: string;

  /**
   * @param message    Optional error message (defaults to "an error occurred")
   * @param errorType  Optional error code/type (defaults to "UnknownError")
   *
   * NOTE: If your error family is numeric, you probably want to pass `-111`
   * explicitly as the `errorType`. The generic type E is `string | number`,
   * so we default to the string sentinel for safety and consistency.
   */
  constructor(message?: string, errorType?: E) {
    this.message = message ?? "an error occurred";
    this.errorType = (errorType ?? ("UnknownError" as unknown as E)) as E;
  }

  // ─── Rust-like API ─────────────────────────────────────────────
  unwrap<T>(): never {
    throw new Error(
      `BoxedError.unwrap(): ${this.errorType} - ${
        this.message ?? "an error occurred"
      }`
    );
  }
  unwrapOr<T>(fallback: T): T {
    return fallback;
  }
  unwrapOrElse<T>(f: (err: IBoxedError<E>) => T): T {
    return f(this);
  }
  expect<T>(msg: string): never {
    throw new Error(
      `BoxedError.expect(): ${msg} (${this.errorType}${
        this.message ? ` - ${this.message}` : ""
      })`
    );
  }

  map<U>(_f: (t: never) => U): BoxedResponse<U, E> {
    return this as unknown as BoxedResponse<U, E>;
  }
  mapErr<F extends string | number>(
    f: (err: IBoxedError<E>) => { errorType: F; message?: string } | F
  ): BoxedResponse<never, F> {
    const next = f(this);
    if (typeof next === "object") {
      return new BoxedError<F>(next.message, next.errorType);
    }
    return new BoxedError<F>(undefined, next);
  }

  andThen<U>(_f: (t: never) => BoxedResponse<U, E>): BoxedResponse<U, E> {
    return this as unknown as BoxedResponse<U, E>;
  }
  orElse<U>(
    f: (err: IBoxedError<E>) => BoxedResponse<U, E>
  ): BoxedResponse<U, E> {
    return f(this);
  }

  toNullable<T>(): null {
    return null;
  }

  isOk(): this is never {
    return false;
  }
  isErr(): this is IBoxedError<E> {
    return true;
  }
}

/** A class implementing the success shape */
export class BoxedSuccess<T, E extends string | number>
  implements IBoxedSuccess<T, E>
{
  public status: true = true;
  public data: T;

  constructor(data: T) {
    this.data = data;
  }

  // ─── Rust-like API ─────────────────────────────────────────────
  unwrap(): T {
    return this.data;
  }
  unwrapOr(_fallback: T): T {
    return this.data;
  }
  unwrapOrElse(_f: (err: IBoxedError<E>) => T): T {
    return this.data;
  }
  expect(_msg: string): T {
    return this.data;
  }

  map<U>(f: (t: T) => U): BoxedResponse<U, E> {
    return new BoxedSuccess<U, E>(f(this.data));
  }
  mapErr<F extends string | number>(
    _f: (err: never) => { errorType: F; message?: string } | F
  ): BoxedResponse<T, F> {
    // success ignores mapErr, but we widen the error type for chaining
    return this as unknown as BoxedResponse<T, F>;
  }

  andThen<U, E2 extends string | number>(
    f: (t: T) => BoxedResponse<U, E2>
  ): BoxedResponse<U, E2> {
    return f(this.data);
  }
  orElse(
    _f: (err: IBoxedError<E>) => BoxedResponse<T, E>
  ): BoxedResponse<T, E> {
    return this as unknown as BoxedResponse<T, E>;
  }

  toNullable(): T {
    return this.data;
  }

  isOk(): this is IBoxedSuccess<T, E> {
    return true;
  }
  isErr(): this is never {
    return false;
  }
}

/** Convenience constructors */
export const Ok = <T, E extends string | number = never>(
  data: T
): BoxedSuccess<T, E> => new BoxedSuccess<T, E>(data);

/**
 * Create a BoxedError with (message, errorType) order.
 * Defaults: message = "an error occurred", errorType = "UnknownError".
 * If you use numeric error codes, pass your code (e.g. -111) as the second param.
 */
export const Err = <E extends string | number>(
  message?: string,
  errorType?: E
): BoxedError<E> => new BoxedError<E>(message, errorType);

/**
 * Type guard checking if a BoxedResponse is a BoxedError
 */
export function isBoxedError<T, E extends string | number>(
  response: BoxedResponse<T, E>
): response is IBoxedError<E> {
  return response.status === false;
}

export const isErr = isBoxedError;

/** Extra convenience guards */
export function isOk<T, E extends string | number>(
  response: BoxedResponse<T, E>
): response is IBoxedSuccess<T, E> {
  return response.status === true;
}

/** Back-compat consumers (still supported) */
export function consumeOrThrow<T, E extends string | number>(
  response: BoxedResponse<T, E>
): T {
  if (isBoxedError(response)) {
    throw new Error(
      `BoxedError: ${response.errorType} - ${
        response.message || "an error occurred"
      }`
    );
  }
  return response.data;
}

export function consumeOrNull<T, E extends string | number>(
  response: BoxedResponse<T, E>
): T | null {
  return isBoxedError<T, E>(response) ? null : response.data;
}

export function consumeOrCallback<T, E extends string | number>(
  response: BoxedResponse<T, E>,
  callback: (error: IBoxedError<E>) => T
): T {
  return isBoxedError(response) ? callback(response) : response.data;
}

export function consumeUntilSuccess<T, E extends string | number>(
  response: BoxedResponse<T, E>,
  interval: number,
  maxAttempts?: number
): Promise<BoxedResponse<T, E>> {
  maxAttempts = maxAttempts ?? 10; // Default to 10 attempts if not provided
  return new Promise((resolve) => {
    let attempts = 0;

    const intervalId = setInterval(() => {
      if (isBoxedError(response)) {
        if (maxAttempts && attempts >= maxAttempts) {
          clearInterval(intervalId);
          resolve(response);
        } else {
          attempts++;
        }
      } else {
        clearInterval(intervalId);
        resolve(response);
      }
    }, interval);
  });
}

type IBoxedRetryOpts = {
  intervalMs?: number;
  timeoutMs?: number;
};

const DEFAULT_INTERVAL = 1000;
const DEFAULT_TIMEOUT = 10000;
export function retryOnBoxedError(timeOpts?: IBoxedRetryOpts) {
  const interval = timeOpts?.intervalMs ?? DEFAULT_INTERVAL;
  const timeout = timeOpts?.timeoutMs ?? DEFAULT_TIMEOUT;

  return async function <T, E extends string | number>(
    fn: () => Promise<BoxedResponse<T, E>>,
    onRetry?: (attempt: number, err: BoxedError<E>, fnName: string) => void,
    returnErrors: E[] = []
  ): Promise<BoxedResponse<T, E>> {
    const errorSet = new Set(returnErrors);
    const start = Date.now();
    let attempt = 0;

    while (Date.now() - start < timeout) {
      const res = await fn();
      if (
        !isBoxedError(res) ||
        (isBoxedError(res) && errorSet.has(res.errorType))
      ) {
        return res;
      }

      onRetry?.(attempt, res as BoxedError<E>, fn.name);
      attempt++;
      await new Promise((r) => setTimeout(r, interval));
    }

    return new BoxedError<E>("an error occurred", "TimeoutError" as E);
  };
}

// -----------------------------------------------------------------------------
// retryOrThrow  – timeOpts?  →  <T,E>(fn, onRetry?) => Promise<T>
// -----------------------------------------------------------------------------
export function retryOrThrow(timeOpts?: IBoxedRetryOpts) {
  return async function <T, E extends string | number>(
    fn: () => Promise<BoxedResponse<T, E>>,
    onRetry?: (attempt: number, err: BoxedError<E>, fnName: string) => void
  ): Promise<T> {
    const resp = await retryOnBoxedError(timeOpts)<T, E>(fn, onRetry);
    return consumeOrThrow(resp);
  };
}

type SuccessPayload<T> = T extends IBoxedSuccess<infer R, any> ? R : never;

/* Tuple-aware consumer */
export function consumeAll<
  const T extends readonly BoxedResponse<unknown, string | number>[]
>(
  tuple: T,
  consumeFn: <U, E extends string | number>(
    boxed: BoxedResponse<U, E>
  ) => U = consumeOrThrow
): { [K in keyof T]: SuccessPayload<T[K]> } {
  const out = tuple.map(consumeFn);
  return out as unknown as { [K in keyof T]: SuccessPayload<T[K]> };
}
