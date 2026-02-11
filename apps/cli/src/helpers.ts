import { NexusClient, NexusApiError } from './client';
import { isLinked } from './config';

/**
 * Wrap a command action with error handling
 */
export function withErrorHandling<TArgs extends unknown[]>(
  fallbackMessage: string,
  action: (...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await action(...args);
    } catch (error) {
      handleCommandError(error, fallbackMessage);
    }
  };
}

/**
 * Wrap a command that requires authentication
 */
export function withAuth<TArgs extends unknown[]>(
  fallbackMessage: string,
  action: (client: NexusClient, ...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      const client = NexusClient.authenticated();
      await action(client, ...args);
    } catch (error) {
      handleCommandError(error, fallbackMessage);
    }
  };
}

/**
 * Wrap a command that requires project context
 */
export function withProject<TArgs extends unknown[]>(
  fallbackMessage: string,
  action: (client: NexusClient, ...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    if (!isLinked()) {
      console.error('Not linked to a project. Run: nexus project link');
      process.exit(1);
    }
    try {
      const client = NexusClient.withProject();
      await action(client, ...args);
    } catch (error) {
      handleCommandError(error, fallbackMessage);
    }
  };
}

function handleCommandError(error: unknown, fallbackMessage: string): never {
  if (error instanceof NexusApiError) {
    console.error(`Error: ${error.message} (${error.statusCode})`);
    if (error.details) {
      console.error('Details:', JSON.stringify(error.details, null, 2));
    }
  } else if (error instanceof Error) {
    console.error(`${fallbackMessage}: ${error.message}`);
  } else {
    console.error(fallbackMessage);
  }
  process.exit(1);
}
