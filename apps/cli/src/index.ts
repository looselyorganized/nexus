#!/usr/bin/env bun

import { Command } from 'commander';
import { setOutputOptions } from './output';
import { registerAuthCommands } from './commands/auth';
import { registerProjectCommands } from './commands/project';
import { registerFeatureCommands } from './commands/feature';
import { registerRoadmapCommands } from './commands/roadmap';
import { registerLearnCommand } from './commands/learn';
import { registerDecisionCommand } from './commands/decision';
import { registerSaveCommand } from './commands/save';
import { registerStatusCommand } from './commands/status';
import { registerWatchCommand } from './commands/watch';
import { registerSetupCommand } from './commands/setup';

const program = new Command();

program
  .name('nexus')
  .description('Nexus CLI - Multi-agent coordination for engineering teams')
  .version('0.1.0')
  .option('--json', 'Output in JSON format')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    setOutputOptions({ json: opts.json });
  });

registerSetupCommand(program);
registerAuthCommands(program);
registerProjectCommands(program);
registerFeatureCommands(program);
registerRoadmapCommands(program);
registerLearnCommand(program);
registerDecisionCommand(program);
registerSaveCommand(program);
registerStatusCommand(program);
registerWatchCommand(program);

program.parse();
