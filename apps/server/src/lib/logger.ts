import pino from 'pino';
import { config } from '../config';

const loggerOptions: pino.LoggerOptions = {
  level: config.isTest ? 'silent' : config.logLevel,
  ...(config.isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: {
    service: 'nexus-server',
    version: '0.1.0',
  },
};

export const logger = pino(loggerOptions);

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

export type Logger = typeof logger;
