import { Command } from 'commander';
import { withProject } from '../helpers';
import { loadProjectConfigOrThrow } from '../config';
import { appendLocalDecision } from '../export';
import { outputSuccess } from '../output';

const decisionAction = withProject('Failed to add decision', async (
  client,
  title: string,
  options: { rationale?: string; alternatives?: string }
) => {
  const config = loadProjectConfigOrThrow();
  const slug = config.activeFeature;

  await client.addDecision({
    title,
    decision: title,
    rationale: options.rationale,
    alternatives: options.alternatives,
    featureSlug: slug,
  });

  if (slug) {
    appendLocalDecision(slug, {
      title,
      decision: title,
      rationale: options.rationale,
    });
  }

  outputSuccess(`Decision recorded: ${title}`);
});

export function registerDecisionCommand(program: Command): void {
  program
    .command('decision <title>')
    .description('Log a decision')
    .option('-r, --rationale <text>', 'Why this decision was made')
    .option('-a, --alternatives <text>', 'Alternatives considered')
    .action(decisionAction);
}
