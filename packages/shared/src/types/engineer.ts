/**
 * Engineer roles
 */
export type EngineerRole = 'admin' | 'engineer' | 'readonly';

/**
 * Engineer entity
 */
export interface Engineer {
  id: string;
  name: string;
  email: string;
  role: EngineerRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Registration input
 */
export interface RegisterEngineerInput {
  name: string;
  email: string;
}

/**
 * Registration result
 */
export interface RegisterEngineerResult {
  engineer: {
    id: string;
    name: string;
    email: string;
  };
  apiKey: string;
}
