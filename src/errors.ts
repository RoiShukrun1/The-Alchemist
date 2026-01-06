export class AlchemyError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AlchemyError {
  constructor(message: string, public field?: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class APIError extends AlchemyError {
  constructor(
    message: string,
    public service?: string,
    statusCode: number = 500
  ) {
    super(message, "API_ERROR", statusCode);
  }
}

export class DataError extends AlchemyError {
  constructor(message: string, public dataType?: string) {
    super(message, "DATA_ERROR", 500);
  }
}

export class SessionError extends AlchemyError {
  constructor(message: string) {
    super(message, "SESSION_ERROR", 400);
  }
}

