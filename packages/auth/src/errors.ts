export class AuthAccessDeniedError extends Error {
  constructor(message = "Access denied") {
    super(message);
    this.name = "AuthAccessDeniedError";
  }
}
