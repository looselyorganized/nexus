import { Command } from 'commander';
import { NexusClient } from '../client';
import { saveGlobalConfig, clearGlobalConfig, getServerUrl } from '../config';
import { withErrorHandling, withAuth } from '../helpers';
import { output, outputSuccess, formatKeyValue } from '../output';

const loginAction = withErrorHandling('Login failed', async (options: {
  token?: string;
  register?: boolean;
  name?: string;
  email?: string;
  server?: string;
}) => {
  const serverUrl = options.server ?? getServerUrl();

  if (options.register) {
    if (!options.name || !options.email) {
      console.error('--name and --email are required when using --register');
      process.exit(1);
    }

    const client = new NexusClient({ serverUrl });
    const result = await client.register({ name: options.name, email: options.email });

    saveGlobalConfig({
      token: result.apiKey,
      serverUrl,
      engineerId: result.engineer.id,
      engineerName: result.engineer.name,
    });

    output(result, [
      `  Registered as ${result.engineer.name}`,
      `  API Key: ${result.apiKey}`,
      '',
      '  Save this key - it won\'t be shown again!',
    ].join('\n'));
    return;
  }

  if (!options.token) {
    console.error('Provide --token <api-key> or use --register');
    process.exit(1);
  }

  const client = new NexusClient({ serverUrl, token: options.token });
  const me = await client.getMe();

  saveGlobalConfig({
    token: options.token,
    serverUrl,
    engineerId: me.id,
    engineerName: me.name,
  });

  outputSuccess(`Logged in as ${me.name} (${me.email})`);
});

const logoutAction = withErrorHandling('Logout failed', async () => {
  clearGlobalConfig();
  outputSuccess('Logged out');
});

const whoamiAction = withAuth('Failed to get user info', async (client) => {
  const me = await client.getMe();
  output(me, formatKeyValue([
    ['Name', me.name],
    ['Email', me.email],
    ['Role', me.role],
    ['ID', me.id],
  ]));
});

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Authenticate with API key or register')
    .option('-t, --token <key>', 'API key')
    .option('-r, --register', 'Register a new account')
    .option('-n, --name <name>', 'Engineer name (with --register)')
    .option('-e, --email <email>', 'Email (with --register)')
    .option('-s, --server <url>', 'Server URL')
    .action(loginAction);

  program
    .command('logout')
    .description('Clear stored credentials')
    .action(logoutAction);

  program
    .command('whoami')
    .description('Show current engineer')
    .action(whoamiAction);
}
