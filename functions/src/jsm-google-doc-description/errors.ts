export type FunctionErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "DOC_NOT_FOUND"
  | "DOC_ACCESS_DENIED"
  | "METHOD_NOT_ALLOWED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UPSTREAM_RATE_LIMITED"
  | "DOCS_API_ERROR"
  | "DOCS_API_TIMEOUT"
  | "INTERNAL_ERROR";

export class FunctionError extends Error {
  constructor(
    readonly status: number,
    readonly code: FunctionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FunctionError";
  }
}

export function asFunctionError(error: unknown): FunctionError {
  if (error instanceof FunctionError) {
    return error;
  }

  return new FunctionError(
    500,
    "INTERNAL_ERROR",
    "Function 發生未預期錯誤。",
  );
}
