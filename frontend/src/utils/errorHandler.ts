// Error handling utilities for authentication

export interface AuthError {
  code: string;
  message: string;
  type: 'validation' | 'network' | 'auth' | 'server' | 'unknown';
  field?: string;
  statusCode?: number;
}

export interface BackendErrorResponse {
  ok: false;
  error: string;
  code: string;
  field?: string;
  timestamp: string;
  statusCode: number;
}

export const getAuthError = (error: any): AuthError => {
  // Handle structured backend error responses
  if (error.error && error.code && error.statusCode) {
    const backendError = error as BackendErrorResponse;
    return {
      code: backendError.code,
      message: backendError.error,
      field: backendError.field,
      statusCode: backendError.statusCode,
      type: getErrorTypeFromCode(backendError.code)
    };
  }

  // Network errors
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Network error. Please check your connection and try again.',
      type: 'network'
    };
  }

  if (error.message?.includes('timeout')) {
    return {
      code: 'TIMEOUT_ERROR',
      message: 'Request timed out. Please try again.',
      type: 'network'
    };
  }

  // HTTP status code errors
  if (error.status) {
    switch (error.status) {
      case 400:
        return {
          code: 'BAD_REQUEST',
          message: 'Invalid request. Please check your input and try again.',
          type: 'validation',
          statusCode: 400
        };
      case 401:
        return {
          code: 'UNAUTHORIZED',
          message: 'Authentication failed. Please try again.',
          type: 'auth',
          statusCode: 401
        };
      case 403:
        return {
          code: 'FORBIDDEN',
          message: 'Access denied. Please contact support.',
          type: 'auth',
          statusCode: 403
        };
      case 404:
        return {
          code: 'NOT_FOUND',
          message: 'Service not found. Please try again later.',
          type: 'server',
          statusCode: 404
        };
      case 409:
        return {
          code: 'CONFLICT',
          message: 'Account already exists with this email.',
          type: 'auth',
          statusCode: 409
        };
      case 429:
        return {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          type: 'auth',
          statusCode: 429
        };
      case 500:
        return {
          code: 'SERVER_ERROR',
          message: 'Server error. Please try again later.',
          type: 'server',
          statusCode: 500
        };
      case 503:
        return {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable. Please try again later.',
          type: 'server',
          statusCode: 503
        };
    }
  }

  // Default error
  return {
    code: 'UNKNOWN_ERROR',
    message: error.message || 'Something went wrong. Please try again.',
    type: 'unknown'
  };
};

const getErrorTypeFromCode = (code: string): 'validation' | 'network' | 'auth' | 'server' | 'unknown' => {
  if (code.includes('VALIDATION') || code.includes('PASSWORD_TOO') || code.includes('EMAIL') || code.includes('INVALID_EMAIL')) {
    return 'validation';
  }
  if (code.includes('CREDENTIALS') || code.includes('USER_') || code.includes('RATE_LIMITED') || code.includes('EMAIL_NOT_CONFIRMED') || code.includes('INVALID_PASSWORD') || code.includes('ACCOUNT_BLOCKED') || code.includes('ACCOUNT_SUSPENDED')) {
    return 'auth';
  }
  if (code.includes('SERVER') || code.includes('INTERNAL') || code.includes('SERVICE_UNAVAILABLE')) {
    return 'server';
  }
  if (code.includes('NETWORK') || code.includes('TIMEOUT')) {
    return 'network';
  }
  return 'unknown';
};

export const isRetryableError = (error: AuthError): boolean => {
  return error.type === 'network' || error.type === 'server';
};

export const getRetryDelay = (attempt: number): number => {
  // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
  return Math.min(1000 * Math.pow(2, attempt), 30000);
};

// Error logging utility
export const logError = (error: AuthError, context: string) => {
  console.error(`[${context}] Error:`, {
    code: error.code,
    message: error.message,
    type: error.type,
    field: error.field,
    statusCode: error.statusCode,
    timestamp: new Date().toISOString()
  });
};
