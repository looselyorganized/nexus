import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  integer,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { SessionMetadata } from '@nexus/shared';

// Enums
export const engineerRoleEnum = pgEnum('engineer_role', ['admin', 'engineer', 'readonly']);
export const sessionStatusEnum = pgEnum('session_status', ['active', 'disconnected']);
export const checkpointTypeEnum = pgEnum('checkpoint_type', [
  'auto_periodic',
  'manual',
  'crash_recovery',
]);

// ─── Engineers ───
export const engineers = pgTable(
  'engineers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    role: engineerRoleEnum('role').notNull().default('engineer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('engineers_email_idx').on(table.email)]
);

// ─── API Keys ───
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engineerId: uuid('engineer_id')
      .notNull()
      .references(() => engineers.id, { onDelete: 'cascade' }),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('api_keys_engineer_idx').on(table.engineerId),
    index('api_keys_prefix_idx').on(table.keyPrefix),
  ]
);

// ─── Projects ───
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    repoUrl: text('repo_url'),
    repoPath: text('repo_path'),
    defaultBranch: text('default_branch').notNull().default('main'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('projects_slug_idx').on(table.slug)]
);

// ─── Project Members ───
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    engineerId: uuid('engineer_id')
      .notNull()
      .references(() => engineers.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
  },
  (table) => [
    uniqueIndex('project_members_pk').on(table.projectId, table.engineerId),
    index('project_members_engineer_idx').on(table.engineerId),
  ]
);

// ─── Features ───
export const features = pgTable(
  'features',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    spec: text('spec').notNull(),
    status: text('status').notNull().default('draft'),
    lane: text('lane').notNull().default('next'),
    priority: integer('priority').notNull(),
    touches: text('touches').array().notNull().default(sql`'{}'`),
    createdBy: uuid('created_by').references(() => engineers.id),
    claimedBy: uuid('claimed_by').references(() => engineers.id),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('features_project_slug_idx').on(table.projectId, table.slug),
    index('features_project_idx').on(table.projectId),
    index('features_status_idx').on(table.status),
    index('features_lane_idx').on(table.lane),
  ]
);

// ─── Learnings ───
export const learnings = pgTable(
  'learnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => features.id, { onDelete: 'cascade' }),
    engineerId: uuid('engineer_id')
      .notNull()
      .references(() => engineers.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('learnings_feature_idx').on(table.featureId),
    index('learnings_created_idx').on(table.createdAt),
  ]
);

// ─── Decisions ───
export const decisions = pgTable(
  'decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id').references(() => features.id, { onDelete: 'set null' }),
    engineerId: uuid('engineer_id')
      .notNull()
      .references(() => engineers.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    decision: text('decision').notNull(),
    rationale: text('rationale'),
    alternatives: text('alternatives'),
    supersedes: uuid('supersedes').references((): AnyPgColumn => decisions.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('decisions_project_idx').on(table.projectId),
    index('decisions_feature_idx').on(table.featureId),
    index('decisions_created_idx').on(table.createdAt),
  ]
);

// ─── Sessions ───
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    engineerId: uuid('engineer_id')
      .notNull()
      .references(() => engineers.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id').references(() => features.id, { onDelete: 'set null' }),
    status: sessionStatusEnum('status').notNull().default('active'),
    lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<SessionMetadata>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_project_idx').on(table.projectId),
    index('sessions_engineer_idx').on(table.engineerId),
    index('sessions_status_idx').on(table.status),
    uniqueIndex('sessions_active_unique_idx')
      .on(table.projectId, table.engineerId)
      .where(sql`status = 'active'`),
  ]
);

// ─── Checkpoints ───
export const checkpoints = pgTable(
  'checkpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => features.id, { onDelete: 'cascade' }),
    engineerId: uuid('engineer_id')
      .notNull()
      .references(() => engineers.id, { onDelete: 'cascade' }),
    type: checkpointTypeEnum('checkpoint_type').notNull(),
    stateHash: text('state_hash'),
    activeClaims: jsonb('active_claims').notNull().default([]),
    context: jsonb('context').notNull(),
    notes: text('notes'),
    isLatest: boolean('is_latest').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('checkpoints_session_idx').on(table.sessionId),
    index('checkpoints_engineer_idx').on(table.engineerId),
    uniqueIndex('checkpoints_latest_unique_idx')
      .on(table.engineerId, table.featureId)
      .where(sql`is_latest = true`),
  ]
);

// ─── Type exports ───
export type Engineer = typeof engineers.$inferSelect;
export type NewEngineer = typeof engineers.$inferInsert;
export type ApiKeyRecord = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type FeatureRecord = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;
export type LearningRecord = typeof learnings.$inferSelect;
export type NewLearning = typeof learnings.$inferInsert;
export type DecisionRecord = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;
export type SessionRecord = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type CheckpointRecord = typeof checkpoints.$inferSelect;
export type NewCheckpoint = typeof checkpoints.$inferInsert;
