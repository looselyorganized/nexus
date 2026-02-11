import { Command } from 'commander';
import { withProject } from '../helpers';
import { output, formatTable } from '../output';

const showAction = withProject('Failed to get roadmap', async (client) => {
  const roadmap = await client.getRoadmap();

  output(roadmap, roadmap.lanes
    .filter((l: any) => l.features.length > 0)
    .map((l: any) => {
      const header = `\n  ${l.lane.toUpperCase()} (${l.features.length})`;
      const table = formatTable(
        ['Pri', 'Slug', 'Title', 'Status'],
        l.features.map((f: any) => [
          String(f.priority),
          f.slug,
          f.title.slice(0, 40),
          f.status,
        ])
      );
      return `${header}\n${table}`;
    })
    .join('\n'));
});

const moveAction = withProject('Failed to move feature', async (
  client,
  slug: string,
  options: { before?: string }
) => {
  // Simple reorder: move slug before the target within its lane
  const roadmap = await client.getRoadmap();
  const feature = roadmap.lanes
    .flatMap((l: any) => l.features)
    .find((f: any) => f.slug === slug);

  if (!feature) {
    console.error(`Feature not found: ${slug}`);
    process.exit(1);
  }

  if (options.before) {
    // Reorder within the lane
    const lane = roadmap.lanes.find((l: any) => l.lane === feature.lane);
    if (!lane) return;

    const slugs = lane.features
      .map((f: any) => f.slug)
      .filter((s: string) => s !== slug);

    const idx = slugs.indexOf(options.before);
    if (idx === -1) {
      console.error(`Target feature not found in same lane: ${options.before}`);
      process.exit(1);
    }

    slugs.splice(idx, 0, slug);
    await client.reorderRoadmap({ [feature.lane]: slugs });
    console.log(`  Moved ${slug} before ${options.before}`);
  }
});

const promoteAction = withProject('Failed to promote feature', async (client, slug: string) => {
  const laneOrder = ['icebox', 'later', 'next', 'now'];
  const roadmap = await client.getRoadmap();
  const feature = roadmap.lanes
    .flatMap((l: any) => l.features)
    .find((f: any) => f.slug === slug);

  if (!feature) {
    console.error(`Feature not found: ${slug}`);
    process.exit(1);
  }

  const idx = laneOrder.indexOf(feature.lane);
  if (idx >= laneOrder.length - 1) {
    console.log(`  ${slug} is already in the highest lane (now)`);
    return;
  }

  const newLane = laneOrder[idx + 1]!;
  await client.moveToLane(slug, newLane);
  console.log(`  Promoted ${slug}: ${feature.lane} -> ${newLane}`);
});

const deferAction = withProject('Failed to defer feature', async (client, slug: string) => {
  const laneOrder = ['icebox', 'later', 'next', 'now'];
  const roadmap = await client.getRoadmap();
  const feature = roadmap.lanes
    .flatMap((l: any) => l.features)
    .find((f: any) => f.slug === slug);

  if (!feature) {
    console.error(`Feature not found: ${slug}`);
    process.exit(1);
  }

  const idx = laneOrder.indexOf(feature.lane);
  if (idx <= 0) {
    console.log(`  ${slug} is already in the lowest lane (icebox)`);
    return;
  }

  const newLane = laneOrder[idx - 1]!;
  await client.moveToLane(slug, newLane);
  console.log(`  Deferred ${slug}: ${feature.lane} -> ${newLane}`);
});

export function registerRoadmapCommands(program: Command): void {
  program
    .command('roadmap')
    .description('Display roadmap')
    .action(showAction);

  const roadmapCmd = program.command('roadmap-ops').description('Roadmap operations').alias('rm');

  roadmapCmd
    .command('move <slug>')
    .description('Reorder feature within lane')
    .option('--before <slug>', 'Move before this feature')
    .action(moveAction);

  roadmapCmd
    .command('promote <slug>')
    .description('Move feature to higher priority lane')
    .action(promoteAction);

  roadmapCmd
    .command('defer <slug>')
    .description('Move feature to lower priority lane')
    .action(deferAction);
}
