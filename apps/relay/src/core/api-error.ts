// Thrown by the scope layer. RPC callers see only the message; the HTTP layer maps the status.
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 503,
    message: string,
  ) {
    super(message);
  }
}
