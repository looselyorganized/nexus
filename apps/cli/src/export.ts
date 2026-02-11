import { existsSync, mkdirSync, writeFileSync, appendFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

const NEXUS_DIR = '.nexus';
const ACTIVE_DIR = 'active';

function activeDir(slug: string, cwd: string = process.cwd()): string {
  return join(cwd, NEXUS_DIR, ACTIVE_DIR, slug);
}

/**
 * Write feature spec, learnings, and decisions to .nexus/active/<slug>/
 */
export function exportFeatureToRepo(params: {
  slug: string;
  spec: string;
  learnings?: Array<{ content: string; createdAt: string }>;
  decisions?: Array<{ title: string; decision: string; rationale?: string; createdAt: string }>;
  cwd?: string;
}): void {
  const dir = activeDir(params.slug, params.cwd);
  mkdirSync(dir, { recursive: true });

  // Write spec
  writeFileSync(join(dir, 'spec.md'), params.spec);

  // Write learnings
  if (params.learnings && params.learnings.length > 0) {
    const content = params.learnings
      .map((l) => `## ${l.createdAt}\n\n${l.content}`)
      .join('\n\n---\n\n');
    writeFileSync(join(dir, 'learnings.md'), `# Learnings\n\n${content}\n`);
  } else {
    writeFileSync(join(dir, 'learnings.md'), '# Learnings\n');
  }

  // Write decisions
  if (params.decisions && params.decisions.length > 0) {
    const content = params.decisions
      .map((d) => {
        let entry = `## ${d.title}\n\n**Decision:** ${d.decision}`;
        if (d.rationale) entry += `\n\n**Rationale:** ${d.rationale}`;
        entry += `\n\n_${d.createdAt}_`;
        return entry;
      })
      .join('\n\n---\n\n');
    writeFileSync(join(dir, 'decisions.md'), `# Decisions\n\n${content}\n`);
  } else {
    writeFileSync(join(dir, 'decisions.md'), '# Decisions\n');
  }

  // Ensure .nexus/active/ is in .gitignore
  ensureGitignore(params.cwd);
}

/**
 * Append a learning to the local learnings.md file
 */
export function appendLocalLearning(slug: string, content: string, cwd?: string): void {
  const dir = activeDir(slug, cwd);
  const path = join(dir, 'learnings.md');
  if (!existsSync(path)) return;

  const timestamp = new Date().toISOString();
  appendFileSync(path, `\n\n---\n\n## ${timestamp}\n\n${content}`);
}

/**
 * Append a decision to the local decisions.md file
 */
export function appendLocalDecision(
  slug: string,
  params: { title: string; decision: string; rationale?: string },
  cwd?: string
): void {
  const dir = activeDir(slug, cwd);
  const path = join(dir, 'decisions.md');
  if (!existsSync(path)) return;

  const timestamp = new Date().toISOString();
  let entry = `\n\n---\n\n## ${params.title}\n\n**Decision:** ${params.decision}`;
  if (params.rationale) entry += `\n\n**Rationale:** ${params.rationale}`;
  entry += `\n\n_${timestamp}_`;
  appendFileSync(path, entry);
}

/**
 * Delete .nexus/active/<slug>/ on feature done
 */
export function cleanupFeatureExport(slug: string, cwd?: string): void {
  const dir = activeDir(slug, cwd);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Check if a feature has local export
 */
export function hasLocalExport(slug: string, cwd?: string): boolean {
  return existsSync(activeDir(slug, cwd));
}

function ensureGitignore(cwd: string = process.cwd()): void {
  const gitignorePath = join(cwd, '.gitignore');
  const entry = '.nexus/active/';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.includes(entry)) return;
    appendFileSync(gitignorePath, `\n${entry}\n`);
  } else {
    writeFileSync(gitignorePath, `${entry}\n`);
  }
}
