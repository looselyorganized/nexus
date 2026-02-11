/**
 * File claim — represents an engineer's lock on a file path
 */
export interface FileClaim {
  filePath: string;
  projectId: string;
  engineerId: string;
  engineerName?: string;
  featureId: string;
  claimedAt: Date;
  expiresAt: Date | null;
}

/**
 * Claim conflict info
 */
export interface ClaimConflict {
  filePath: string;
  claimedBy: {
    engineerId: string;
    engineerName?: string;
    featureId: string;
    claimedAt: Date;
  };
}

/**
 * Result of a claim operation
 */
export interface ClaimResult {
  success: boolean;
  claimed: string[];
  conflicts: ClaimConflict[];
}

/**
 * Conflict check result
 */
export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: ClaimConflict[];
  available: string[];
}
