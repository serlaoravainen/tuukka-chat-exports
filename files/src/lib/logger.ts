/* Timanttinen virhe-normalisointi: EI enää console.error({}) -roskaa */
type NormalizedError = {
  name: string
  message: string
  stack?: string
  status?: number
  cause?: unknown
  extra?: Record<string, unknown>
};

function isResponseLike(x: unknown): x is Response & { url?: string } {
  return typeof x === "object" && x !== null && "status" in x && "ok" in x;
}

export function normalizeError(err: unknown): NormalizedError {
  if (isResponseLike(err)) {
    return {
      name: "HTTPError",
      message: `HTTP ${err.status} ${err.statusText ?? ""}`.trim(),
      status: err.status,
      extra: err instanceof Response ? { url: err.url } : undefined,
    };
  }

  if (err instanceof Error) {
    const { cause } = err as { cause?: unknown };
    return {
      name: err.name || "Error",
      message: err.message || "Unknown error",
      stack: err.stack,
      cause,
    };
  }

  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    const name =
      typeof obj.name === "string" ? obj.name : "UnknownObjectError";
    const message =
      typeof obj.message === "string"
        ? obj.message
        : JSON.stringify(obj);
    return { name, message, extra: obj };
  }

  if (typeof err === "string") {
    return { name: "StringError", message: err };
  }

  return { name: "Unknown", message: String(err) };
}

export function logError(context: string, err: unknown) {
  const n = normalizeError(err);
  console.error(`[${context}] ${n.name}: ${n.message}`, {
    status: n.status,
    cause: n.cause,
    extra: n.extra,
    stack: n.stack,
  });
}

export function logInfo(context: string, data?: unknown) {
  if (data === undefined) console.info(`[${context}]`);
  else console.info(`[${context}]`, data);
}