import { Command } from 'commander';
import { withProject } from '../helpers';
import { output, formatTable, shortId } from '../output';

const statusAction = withProject('Failed to get status', async (client) => {
  const status = await client.getStatus();

  const sections: string[] = [];

  // Active features
  if (status.activeFeatures?.length > 0) {
    sections.push('  ACTIVE FEATURES');
    sections.push(formatTable(
      ['Slug', 'Title', 'Engineer'],
      status.activeFeatures.map((f: any) => [
        f.slug,
        f.title.slice(0, 35),
        f.claimedBy ? shortId(f.claimedBy) : '-',
      ])
    ));
  } else {
    sections.push('  No active features');
  }

  // Claims
  if (status.claims?.length > 0) {
    sections.push('\n  FILE CLAIMS');
    sections.push(formatTable(
      ['File', 'Engineer', 'Feature'],
      status.claims.map((c: any) => [
        c.filePath,
        c.engineerName ?? shortId(c.engineerId),
        shortId(c.featureId),
      ])
    ));
  }

  // Sessions
  if (status.sessions?.length > 0) {
    sections.push('\n  ACTIVE SESSIONS');
    sections.push(formatTable(
      ['Engineer', 'Feature', 'Since'],
      status.sessions.map((s: any) => [
        s.engineer?.name ?? shortId(s.engineerId),
        s.featureId ? shortId(s.featureId) : '-',
        new Date(s.createdAt).toLocaleString(),
      ])
    ));
  }

  output(status, sections.join('\n'));
});

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show project status')
    .action(statusAction);
}
