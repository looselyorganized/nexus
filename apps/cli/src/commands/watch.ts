import type { Command } from 'commander';
import { isLinked, loadGlobalConfigOrThrow, loadProjectConfigOrThrow, getServerUrl } from '../config';
import { isJsonMode } from '../output';

const EVENT_ICONS: Record<string, string> = {
  feature_created: '+',
  feature_updated: '~',
  feature_claimed: '>',
  feature_released: '<',
  feature_completed: '*',
  files_claimed: '#',
  files_released: '#',
  learning_added: 'L',
  decision_added: 'D',
  session_started: 'S',
  session_ended: 'X',
  connected: '.',
  joined: '.',
  left: '.',
  error: '!',
};

function engineerName(event: Record<string, unknown>): string {
  const eng = event.engineer as Record<string, unknown> | undefined;
  return (eng?.name ?? eng?.id ?? 'unknown') as string;
}

function featureSlug(event: Record<string, unknown>): string {
  const feat = event.feature as Record<string, unknown> | undefined;
  return (feat?.slug ?? feat?.title ?? 'unknown') as string;
}

function fileCount(event: Record<string, unknown>): string | number {
  const paths = event.paths;
  return Array.isArray(paths) ? paths.length : '?';
}

function formatEvent(event: Record<string, unknown>): string {
  const type = event.type as string;
  const icon = EVENT_ICONS[type] ?? '?';
  const time = new Date().toLocaleTimeString();
  const prefix = `[${time}] ${icon}`;

  switch (type) {
    case 'feature_claimed':
      return `${prefix} ${engineerName(event)} picked "${featureSlug(event)}"`;
    case 'feature_released':
      return `${prefix} ${engineerName(event)} released "${featureSlug(event)}"`;
    case 'feature_completed':
      return `${prefix} ${engineerName(event)} completed "${featureSlug(event)}"`;
    case 'feature_updated':
      return `${prefix} "${featureSlug(event)}" ${event.field ?? 'unknown'} updated`;
    case 'files_claimed':
      return `${prefix} ${engineerName(event)} claimed ${fileCount(event)} file(s)`;
    case 'files_released':
      return `${prefix} ${engineerName(event)} released ${fileCount(event)} file(s)`;
    case 'learning_added':
      return `${prefix} Learning added to "${featureSlug(event)}"`;
    case 'decision_added':
      return `${prefix} Decision logged for "${featureSlug(event)}"`;
    case 'session_started':
      return `${prefix} ${engineerName(event)} started a session`;
    case 'session_ended':
      return `${prefix} ${engineerName(event)} session ended`;
    case 'connected':
      return `${prefix} Connected to Nexus`;
    case 'joined':
      return `${prefix} Joined project room`;
    case 'error':
      return `${prefix} Error: ${event.message ?? 'unknown'}`;
    default:
      return `${prefix} ${type}`;
  }
}

export function registerWatchCommand(program: Command) {
  program
    .command('watch')
    .description('Real-time activity stream via WebSocket')
    .action(async () => {
      if (!isLinked()) {
        console.error('Not linked to a project. Run: nexus project link');
        process.exit(1);
      }

      const global = loadGlobalConfigOrThrow();
      const project = loadProjectConfigOrThrow();
      const serverUrl = getServerUrl();

      // Convert http(s) to ws(s)
      const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws';

      if (!isJsonMode()) {
        console.log(`Connecting to ${wsUrl}...`);
      }

      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${global.token}`,
        },
      } as any);

      let heartbeatInterval: Timer | null = null;

      ws.onopen = () => {
        // Send join message
        ws.send(JSON.stringify({ type: 'join', projectId: project.projectId }));

        // Start heartbeat
        heartbeatInterval = setInterval(() => {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
        }, 30_000);

        if (!isJsonMode()) {
          console.log('Watching for activity... (Ctrl+C to stop)\n');
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));

          if (isJsonMode()) {
            console.log(JSON.stringify(data));
          } else {
            const formatted = formatEvent(data);
            console.log(formatted);
          }
        } catch {
          // Ignore unparseable messages
        }
      };

      ws.onerror = () => {
        console.error('WebSocket error - connection failed');
        cleanup();
        process.exit(1);
      };

      ws.onclose = (event) => {
        if (!isJsonMode()) {
          console.log(`\nDisconnected (code: ${event.code})`);
        }
        cleanup();
        process.exit(0);
      };

      function cleanup() {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      }

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        ws.send(JSON.stringify({ type: 'leave' }));
        ws.close();
        cleanup();
        process.exit(0);
      });

      // Keep the process alive
      await new Promise(() => {});
    });
}
