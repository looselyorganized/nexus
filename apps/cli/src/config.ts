import { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Global Config (~/.nexus/config.json) ───

const globalConfigSchema = z.object({
  token: z.string(),
  serverUrl: z.string().url(),
  engineerId: z.string().uuid(),
  engineerName: z.string(),
});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;

const GLOBAL_DIR = join(homedir(), '.nexus');
const GLOBAL_PATH = join(GLOBAL_DIR, 'config.json');

export function loadGlobalConfig(): GlobalConfig | null {
  if (!existsSync(GLOBAL_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(GLOBAL_PATH, 'utf-8'));
    return globalConfigSchema.parse(raw);
  } catch {
    return null;
  }
}

export function loadGlobalConfigOrThrow(): GlobalConfig {
  const config = loadGlobalConfig();
  if (!config) {
    console.error('Not logged in. Run: nexus login');
    process.exit(1);
  }
  return config;
}

export function saveGlobalConfig(config: GlobalConfig): void {
  mkdirSync(GLOBAL_DIR, { recursive: true });
  writeFileSync(GLOBAL_PATH, JSON.stringify(config, null, 2));
}

export function clearGlobalConfig(): void {
  if (existsSync(GLOBAL_PATH)) unlinkSync(GLOBAL_PATH);
}

export function isLoggedIn(): boolean {
  return loadGlobalConfig() !== null;
}

export function getServerUrl(): string {
  return process.env.NEXUS_SERVER_URL ?? loadGlobalConfig()?.serverUrl ?? 'http://localhost:3001';
}

// ─── Project Config (.nexus.json in project root) ───

const projectConfigSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string(),
  projectSlug: z.string(),
  linkedAt: z.string(),
  activeFeature: z.string().optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

function projectConfigPath(cwd: string = process.cwd()): string {
  return join(cwd, '.nexus.json');
}

export function loadProjectConfig(cwd?: string): ProjectConfig | null {
  const path = projectConfigPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    return projectConfigSchema.parse(raw);
  } catch {
    return null;
  }
}

export function loadProjectConfigOrThrow(cwd?: string): ProjectConfig {
  const config = loadProjectConfig(cwd);
  if (!config) {
    console.error('Not linked to a project. Run: nexus project link');
    process.exit(1);
  }
  return config;
}

export function saveProjectConfig(config: ProjectConfig, cwd?: string): void {
  writeFileSync(projectConfigPath(cwd), JSON.stringify(config, null, 2));
}

export function updateProjectConfig(updates: Partial<ProjectConfig>, cwd?: string): void {
  const config = loadProjectConfigOrThrow(cwd);
  saveProjectConfig({ ...config, ...updates }, cwd);
}

export function clearProjectConfig(cwd?: string): void {
  const path = projectConfigPath(cwd);
  if (existsSync(path)) unlinkSync(path);
}

export function isLinked(cwd?: string): boolean {
  return loadProjectConfig(cwd) !== null;
}
