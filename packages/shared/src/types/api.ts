/**
 * Standard API error response
 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/**
 * Standard API success response wrapper
 */
export interface ApiResponse<T> {
  data: T;
}

/**
 * Cursor-based pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Error codes used across the API
 */
export const ErrorCodes = {
  // Authentication
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_API_KEY: 'INVALID_API_KEY',

  // Authorization
  FORBIDDEN: 'FORBIDDEN',
  NOT_PROJECT_MEMBER: 'NOT_PROJECT_MEMBER',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // Conflicts
  FILE_ALREADY_CLAIMED: 'FILE_ALREADY_CLAIMED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
