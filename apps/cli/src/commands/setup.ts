import { Command } from 'commander';
import * as p from '@clack/prompts';
import { basename } from 'path';
import { NexusClient, NexusApiError } from '../client';
import { loadGlobalConfig, saveGlobalConfig, saveProjectConfig } from '../config';
import { isGitRepo, getGitRoot, getRemoteUrl } from '../git';
import { isJsonMode } from '../output';

const NEXUS_CLOUD_URL = 'https://nexus-production.up.railway.app';
const LOCAL_DEV_URL = 'http://localhost:3001';

function required<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
  return value;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

async function checkHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

type AuthResult = { token: string; engineerId: string; engineerName: string };

async function resolveAuth(serverUrl: string, existingToken: string | null): Promise<AuthResult> {
  if (!existingToken) return promptAuth(serverUrl);

  const s = p.spinner();
  s.start('Verifying existing credentials...');
  try {
    const client = new NexusClient({ serverUrl, token: existingToken });
    const me = await client.getMe();
    s.stop(`Authenticated as ${me.name} (${me.email}).`);
    return { token: existingToken, engineerId: me.id, engineerName: me.name };
  } catch {
    s.stop('Existing credentials are invalid.');
    return promptAuth(serverUrl);
  }
}

async function setupAction() {
  if (isJsonMode()) {
    console.error('Error: nexus setup is interactive and cannot produce JSON output.');
    process.exit(1);
  }

  if (!process.stdin.isTTY) {
    console.error('Error: nexus setup requires an interactive terminal.');
    process.exit(1);
  }

  p.intro('Nexus Setup');

  const globalConfig = loadGlobalConfig();
  const inGitRepo = isGitRepo();
  const gitRoot = inGitRepo ? getGitRoot() : null;

  // ─── Step 1: Server URL ───

  let serverUrl: string;

  if (globalConfig?.serverUrl) {
    const keep = required(await p.confirm({
      message: `Server is set to ${globalConfig.serverUrl}. Keep it?`,
      initialValue: true,
    }));
    serverUrl = keep ? globalConfig.serverUrl : await promptServerUrl();
  } else {
    serverUrl = await promptServerUrl();
  }

  const s1 = p.spinner();
  s1.start('Checking server connectivity...');
  const healthy = await checkHealth(serverUrl);
  if (healthy) {
    s1.stop('Server is reachable.');
  } else {
    s1.stop('Server is not reachable.');
    const cont = required(await p.confirm({
      message: 'Server is not reachable. Continue anyway?',
      initialValue: false,
    }));
    if (!cont) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }
  }

  // ─── Step 2: Authentication ───

  const auth = await resolveAuth(serverUrl, globalConfig?.token ?? null);

  saveGlobalConfig({ token: auth.token, serverUrl, engineerId: auth.engineerId, engineerName: auth.engineerName });

  // ─── Step 3: Project ───

  const client = new NexusClient({ serverUrl, token: auth.token });

  let projectId: string;
  let projectName: string;
  let projectSlug: string;

  const s3 = p.spinner();
  s3.start('Fetching projects...');
  const projects = await client.listProjects().catch(() => [] as any[]);
  s3.stop(projects.length > 0 ? `Found ${projects.length} project(s).` : 'No projects found.');

  const projectOptions: { value: string; label: string }[] = [
    { value: '__new__', label: 'Create a new project' },
    ...projects.map((proj: any) => ({
      value: proj.id,
      label: `${proj.name} (${proj.slug})`,
    })),
  ];

  const projectChoice = required(await p.select({
    message: 'Select a project:',
    options: projectOptions,
  }));

  if (projectChoice === '__new__') {
    const dirName = gitRoot ? basename(gitRoot) : basename(process.cwd());
    const suggestedSlug = slugify(dirName);

    const name = required(await p.text({
      message: 'Project name:',
      placeholder: dirName,
      defaultValue: dirName,
      validate: (v) => (v.length === 0 ? 'Name is required' : undefined),
    }));

    const slug = required(await p.text({
      message: 'Project slug:',
      placeholder: suggestedSlug,
      defaultValue: suggestedSlug,
      validate: (v) => {
        if (v.length === 0) return 'Slug is required';
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(v)) return 'Slug must be lowercase alphanumeric with hyphens';
        return undefined;
      },
    }));

    const repoUrl = inGitRepo ? getRemoteUrl() : null;

    const s4 = p.spinner();
    s4.start('Creating project...');
    try {
      const project = await client.createProject({
        name,
        slug,
        repoUrl: repoUrl ?? undefined,
        repoPath: gitRoot ?? process.cwd(),
      });
      s4.stop(`Project "${project.name}" created.`);
      projectId = project.id;
      projectName = project.name;
      projectSlug = project.slug;
    } catch (err) {
      s4.stop('Failed to create project.');
      if (err instanceof NexusApiError && err.statusCode === 409) {
        p.log.error(`Slug "${slug}" is already taken. Run nexus setup again with a different slug.`);
      } else {
        p.log.error(formatError(err));
      }
      process.exit(1);
    }
  } else {
    const selected = projects.find((proj: any) => proj.id === projectChoice);
    projectId = selected.id;
    projectName = selected.name;
    projectSlug = selected.slug;
  }

  // ─── Step 4: Link ───

  let linked = false;

  if (inGitRepo) {
    const shouldLink = required(await p.confirm({
      message: `Link project "${projectName}" to this directory?`,
      initialValue: true,
    }));

    if (shouldLink) {
      saveProjectConfig({
        projectId,
        projectName,
        projectSlug,
        linkedAt: new Date().toISOString(),
      });
      linked = true;
    }
  } else {
    p.log.info(`Not in a git repo. Link later with: nexus project link ${projectId}`);
  }

  // ─── Step 5: Summary ───

  p.note(
    [
      `Server:   ${serverUrl}`,
      `Engineer: ${auth.engineerName}`,
      `Project:  ${projectName} (${projectSlug})`,
      `Linked:   ${linked ? 'yes' : 'no'}`,
    ].join('\n'),
    'Setup Complete'
  );

  p.outro('Ready! Try: nexus status');
}

async function promptServerUrl(): Promise<string> {
  const choice = required(await p.select({
    message: 'Which server?',
    options: [
      { value: 'cloud', label: 'Nexus Cloud', hint: NEXUS_CLOUD_URL },
      { value: 'local', label: 'Local dev', hint: LOCAL_DEV_URL },
      { value: 'custom', label: 'Custom URL' },
    ],
  }));

  if (choice === 'cloud') return NEXUS_CLOUD_URL;
  if (choice === 'local') return LOCAL_DEV_URL;

  const url = required(await p.text({
    message: 'Server URL:',
    placeholder: 'https://my-nexus.example.com',
    validate: (v) => {
      try {
        new URL(v);
        return undefined;
      } catch {
        return 'Please enter a valid URL (e.g. https://my-nexus.example.com)';
      }
    },
  }));
  return url.replace(/\/$/, '');
}

async function promptAuth(serverUrl: string): Promise<AuthResult> {
  const authChoice = required(await p.select({
    message: 'How would you like to authenticate?',
    options: [
      { value: 'register', label: 'Create a new account' },
      { value: 'login', label: 'I have an API key' },
    ],
  }));

  if (authChoice === 'register') {
    const name = required(await p.text({
      message: 'Your name:',
      validate: (v) => (v.length === 0 ? 'Name is required' : undefined),
    }));

    const email = required(await p.text({
      message: 'Your email:',
      validate: (v) => {
        if (v.length === 0) return 'Email is required';
        if (!v.includes('@')) return 'Please enter a valid email';
        return undefined;
      },
    }));

    const s = p.spinner();
    s.start('Creating account...');
    try {
      const client = new NexusClient({ serverUrl });
      const result = await client.register({ name, email });
      s.stop('Account created.');

      p.note(result.apiKey, 'Your API Key (save this!)');

      return {
        token: result.apiKey,
        engineerId: result.engineer.id,
        engineerName: result.engineer.name,
      };
    } catch (err) {
      s.stop('Registration failed.');
      if (err instanceof NexusApiError && err.statusCode === 409) {
        p.log.error('An account with that email already exists. Try logging in with your API key.');
      } else {
        p.log.error(formatError(err));
      }
      process.exit(1);
    }
  }

  // Login with API key
  const apiKey = required(await p.text({
    message: 'API key:',
    validate: (v) => (v.length === 0 ? 'API key is required' : undefined),
  }));

  const s = p.spinner();
  s.start('Verifying API key...');
  try {
    const client = new NexusClient({ serverUrl, token: apiKey });
    const me = await client.getMe();
    s.stop(`Authenticated as ${me.name}.`);

    return {
      token: apiKey,
      engineerId: me.id,
      engineerName: me.name,
    };
  } catch (err) {
    s.stop('Authentication failed.');
    if (err instanceof NexusApiError && err.statusCode === 401) {
      p.log.error('Invalid API key.');
    } else {
      p.log.error(formatError(err));
    }
    process.exit(1);
  }
}

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Interactive setup wizard for new users')
    .action(setupAction);
}
