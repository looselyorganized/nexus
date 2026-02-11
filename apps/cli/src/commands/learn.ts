import { Command } from 'commander';
import { withProject } from '../helpers';
import { loadProjectConfigOrThrow } from '../config';
import { appendLocalLearning } from '../export';
import { outputSuccess } from '../output';

const learnAction = withProject('Failed to add learning', async (client, content: string) => {
  const config = loadProjectConfigOrThrow();
  const slug = config.activeFeature;
  if (!slug) {
    console.error('No active feature. Pick one first: nexus feature pick <slug>');
    process.exit(1);
  }

  await client.addLearning(slug, content);
  appendLocalLearning(slug, content);
  outputSuccess('Learning added');
});

export function registerLearnCommand(program: Command): void {
  program
    .command('learn <content>')
    .description('Append learning to active feature')
    .action(learnAction);
}
