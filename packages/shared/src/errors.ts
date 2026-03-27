type ErrorContext = Record<string, string | number | boolean | null | undefined>;

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly context?: ErrorContext;

  constructor(
    message: string,
    options: {
      code: string;
      statusCode: number;
      context?: ErrorContext;
      cause?: Error;
    },
  ) {
    super(message, { cause: options.cause });
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.context = options.context;
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, { code: "NOT_FOUND", statusCode: 404, context });
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, { code: "VALIDATION_ERROR", statusCode: 400, context });
    this.name = "ValidationError";
  }
}

export class QueueError extends AppError {
  constructor(message: string, options?: { cause?: Error; context?: ErrorContext }) {
    super(message, { code: "QUEUE_ERROR", statusCode: 500, cause: options?.cause, context: options?.context });
    this.name = "QueueError";
  }
}
