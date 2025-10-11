/**
 * Standardized response utilities for consistent API responses 
 */

export interface ErrorResponse {
  ok: false;
  error: string;
  code?: string;
  field?: string;
  timestamp: string;
  statusCode: number;
}

export interface SuccessResponse<T = any> {
  ok: true;
  data: T;
  message?: string;
  timestamp: string;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  message: string, 
  code?: string, 
  field?: string, 
  statusCode: number = 400
): ErrorResponse {
  const response: ErrorResponse = {
    ok: false,
    error: message,
    timestamp: new Date().toISOString(),
    statusCode
  };
  
  if (code !== undefined) {
    response.code = code;
  }
  
  if (field !== undefined) {
    response.field = field;
  }
  
  return response;
}

/**
 * Create standardized success response
 */
export function createSuccessResponse<T = any>(
  data: T, 
  message?: string
): SuccessResponse<T> {
  const response: SuccessResponse<T> = {
    ok: true,
    data,
    timestamp: new Date().toISOString()
  };
  
  if (message !== undefined) {
    response.message = message;
  }
  
  return response;
}

/**
 * Common error codes
 */
export const ERROR_CODES = {
  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EMAIL_NOT_CONFIRMED: 'EMAIL_NOT_CONFIRMED',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  EMAIL_REQUIRED: 'EMAIL_REQUIRED',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  INVALID_EMAIL: 'INVALID_EMAIL',
  
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  
  // Server errors
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  
  // File upload errors
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  UPLOAD_ERROR: 'UPLOAD_ERROR',
  NO_FILE: 'NO_FILE',
  
  // General errors
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',
  
  // Profile errors
  CREATE_FAILED: 'CREATE_FAILED',
  UPDATE_FAILED: 'UPDATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED'
} as const;

/**
 * Common HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const;