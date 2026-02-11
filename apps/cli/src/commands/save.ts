import { Command } from 'commander';
import { withProject } from '../helpers';
import { loadProjectConfigOrThrow } from '../config';
import { getGitInfo } from '../git';
import { outputSuccess } from '../output';

const saveAction = withProject('Failed to create checkpoint', async (
  client,
  options: { notes?: string }
) => {
  const config = loadProjectConfigOrThrow();
  const slug = config.activeFeature;
  if (!slug) {
    console.error('No active feature. Pick one first: nexus feature pick <slug>');
    process.exit(1);
  }

  // Get feature to find its ID
  const feature = await client.getFeature(slug);

  // Create/get session
  const session = await client.createSession({ featureId: feature.id });

  const gitInfo = getGitInfo();
  const checkpoint = await client.createCheckpoint({
    sessionId: session.id,
    featureId: feature.id,
    context: {
      gitBranch: gitInfo.branch,
      gitCommit: gitInfo.commit,
      dirty: gitInfo.dirty,
    },
    type: 'manual',
    notes: options.notes,
  });

  if (checkpoint) {
    outputSuccess('Checkpoint saved');
  } else {
    console.log('  No changes since last checkpoint');
  }
});

export function registerSaveCommand(program: Command): void {
  program
    .command('save')
    .description('Create a checkpoint for active feature')
    .option('-n, --notes <text>', 'Checkpoint notes')
    .action(saveAction);
}
