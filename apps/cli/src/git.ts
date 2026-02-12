import { spawnSync } from 'child_process';

function execGit(args: string[], cwd: string = process.cwd()): string | null {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 5000,
  });
  return result.status === 0 && result.stdout ? result.stdout.trim() : null;
}

export function isGitRepo(cwd?: string): boolean {
  return execGit(['rev-parse', '--is-inside-work-tree'], cwd) === 'true';
}

export function getCurrentBranch(cwd?: string): string | null {
  return execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export function getCurrentCommit(cwd?: string): string | null {
  return execGit(['rev-parse', '--short=7', 'HEAD'], cwd);
}

export function isDirty(cwd?: string): boolean {
  const result = execGit(['status', '--porcelain'], cwd);
  return result !== null && result.length > 0;
}

export function getGitRoot(cwd?: string): string | null {
  return execGit(['rev-parse', '--show-toplevel'], cwd);
}

export function getRemoteUrl(cwd?: string): string | null {
  return execGit(['remote', 'get-url', 'origin'], cwd);
}

export function getGitInfo(cwd?: string): {
  branch: string | null;
  commit: string | null;
  dirty: boolean;
} {
  return {
    branch: getCurrentBranch(cwd),
    commit: getCurrentCommit(cwd),
    dirty: isDirty(cwd),
  };
}
