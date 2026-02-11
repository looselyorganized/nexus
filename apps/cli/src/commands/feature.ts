import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { withProject } from '../helpers';
import { updateProjectConfig, loadProjectConfigOrThrow } from '../config';
import { output, outputSuccess, formatTable, formatKeyValue, shortId } from '../output';
import { exportFeatureToRepo, cleanupFeatureExport } from '../export';

const SPEC_TEMPLATE = `---
slug:
title:
lane: next
touches: []
---

# Feature Spec

## Goal


## Approach


## Acceptance Criteria

- [ ]
`;

function openEditor(initialContent: string): string | null {
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? 'vi';
  const tmpFile = join(tmpdir(), `nexus-spec-${Date.now()}.md`);
  writeFileSync(tmpFile, initialContent);

  const result = spawnSync(editor, [tmpFile], {
    stdio: 'inherit',
    timeout: 600_000,
  });

  if (result.status !== 0) return null;
  return readFileSync(tmpFile, 'utf-8');
}

function parseFrontmatter(content: string): {
  slug?: string;
  title?: string;
  lane?: string;
  touches?: string[];
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { body: content };

  const frontmatter = match[1]!;
  const body = match[2]!.trim();
  const result: any = { body };

  for (const line of frontmatter.split('\n')) {
    const [key, ...valueParts] = line.split(':');
    if (!key) continue;
    const value = valueParts.join(':').trim();
    if (key.trim() === 'slug') result.slug = value;
    if (key.trim() === 'title') result.title = value;
    if (key.trim() === 'lane') result.lane = value;
    if (key.trim() === 'touches') {
      try { result.touches = JSON.parse(value); } catch {}
    }
  }

  return result;
}

const createAction = withProject('Failed to create feature', async (client, options: {
  from?: string;
  slug?: string;
  title?: string;
}) => {
  let spec: string;
  let slug: string;
  let title: string;
  let lane: string | undefined;
  let touches: string[] | undefined;

  if (options.from) {
    if (!existsSync(options.from)) {
      console.error(`File not found: ${options.from}`);
      process.exit(1);
    }
    const content = readFileSync(options.from, 'utf-8');
    const parsed = parseFrontmatter(content);
    slug = parsed.slug ?? options.slug ?? '';
    title = parsed.title ?? options.title ?? '';
    spec = parsed.body;
    lane = parsed.lane;
    touches = parsed.touches;
  } else {
    const content = openEditor(SPEC_TEMPLATE);
    if (!content) {
      console.error('Editor cancelled');
      process.exit(1);
    }
    const parsed = parseFrontmatter(content);
    slug = parsed.slug ?? '';
    title = parsed.title ?? '';
    spec = parsed.body;
    lane = parsed.lane;
    touches = parsed.touches;
  }

  if (!slug || !title) {
    console.error('slug and title are required');
    process.exit(1);
  }

  const feature = await client.createFeature({ slug, title, spec, lane, touches });
  outputSuccess(`Feature created: ${feature.slug}`);
  output(feature, formatKeyValue([
    ['Slug', feature.slug],
    ['Title', feature.title],
    ['Status', feature.status],
    ['Lane', feature.lane],
  ]));
});

const editAction = withProject('Failed to edit feature', async (client, slug: string) => {
  const feature = await client.getFeature(slug);
  const content = openEditor(feature.spec);
  if (!content) {
    console.error('Editor cancelled');
    return;
  }
  const updated = await client.updateFeature(slug, { spec: content });
  outputSuccess(`Feature updated: ${updated.slug}`);
});

const showAction = withProject('Failed to show feature', async (client, slug: string) => {
  const feature = await client.getFeature(slug);
  output(feature, [
    formatKeyValue([
      ['Slug', feature.slug],
      ['Title', feature.title],
      ['Status', feature.status],
      ['Lane', feature.lane],
      ['Priority', String(feature.priority)],
      ['Claimed By', feature.claimedBy ? shortId(feature.claimedBy) : null],
      ['Touches', feature.touches?.length ? feature.touches.join(', ') : null],
    ]),
    '',
    feature.spec,
  ].join('\n'));
});

const readyAction = withProject('Failed to mark feature ready', async (client, slug: string) => {
  const feature = await client.markReady(slug);
  outputSuccess(`Feature ready: ${feature.slug}`);
});

const listAction = withProject('Failed to list features', async (client, options: {
  status?: string;
  lane?: string;
  limit?: string;
}) => {
  const result = await client.listFeatures({
    status: options.status,
    lane: options.lane,
    limit: options.limit ? parseInt(options.limit) : undefined,
  });

  const items = result.items ?? result;
  if (!items || items.length === 0) {
    console.log('  No features found');
    return;
  }

  output(
    result,
    formatTable(
      ['Slug', 'Title', 'Status', 'Lane', 'Pri'],
      items.map((f: any) => [f.slug, f.title.slice(0, 40), f.status, f.lane, String(f.priority)])
    )
  );
});

const deleteAction = withProject('Failed to delete feature', async (client, slug: string) => {
  await client.deleteFeature(slug);
  outputSuccess(`Feature deleted: ${slug}`);
});

const availableAction = withProject('Failed to get available features', async (client) => {
  const features = await client.getAvailableFeatures();

  if (features.length === 0) {
    console.log('  No available features');
    return;
  }

  output(
    features,
    formatTable(
      ['Slug', 'Title', 'Lane', 'Pri', 'Status'],
      features.map((f: any) => [
        f.slug,
        f.title.slice(0, 35),
        f.lane,
        String(f.priority),
        f.blockedBy ? `blocked by ${f.blockedBy.featureSlug}` : 'available',
      ])
    )
  );
});

const pickAction = withProject('Failed to pick feature', async (client, slug: string) => {
  const feature = await client.pickFeature(slug);

  // Export to repo
  let learnings: any[] = [];
  let decisions: any[] = [];
  try {
    learnings = (await client.listLearnings(slug))?.items ?? [];
  } catch {}
  try {
    decisions = (await client.listDecisions(slug))?.items ?? [];
  } catch {}

  exportFeatureToRepo({
    slug,
    spec: feature.spec,
    learnings,
    decisions,
  });

  updateProjectConfig({ activeFeature: slug });
  outputSuccess(`Picked feature: ${slug}`);
  console.log('  Spec exported to .nexus/active/' + slug + '/');
});

const releaseAction = withProject('Failed to release feature', async (client) => {
  const config = loadProjectConfigOrThrow();
  const slug = config.activeFeature;
  if (!slug) {
    console.error('No active feature. Pick one first: nexus feature pick <slug>');
    process.exit(1);
  }

  await client.releaseFeature(slug);
  cleanupFeatureExport(slug);
  updateProjectConfig({ activeFeature: undefined });
  outputSuccess(`Released feature: ${slug}`);
});

const doneAction = withProject('Failed to complete feature', async (client) => {
  const config = loadProjectConfigOrThrow();
  const slug = config.activeFeature;
  if (!slug) {
    console.error('No active feature');
    process.exit(1);
  }

  await client.markDone(slug);
  cleanupFeatureExport(slug);
  updateProjectConfig({ activeFeature: undefined });
  outputSuccess(`Feature completed: ${slug}`);
});

export function registerFeatureCommands(program: Command): void {
  const feat = program.command('feature').description('Feature management');

  feat
    .command('create')
    .description('Create a new feature spec')
    .option('--from <file>', 'Create from markdown file')
    .option('-s, --slug <slug>', 'Feature slug')
    .option('-t, --title <title>', 'Feature title')
    .action(createAction);

  feat
    .command('edit <slug>')
    .description('Edit feature spec in $EDITOR')
    .action(editAction);

  feat
    .command('show <slug>')
    .description('Show feature details')
    .action(showAction);

  feat
    .command('ready <slug>')
    .description('Mark feature as ready for pickup')
    .action(readyAction);

  feat
    .command('list')
    .description('List features')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --lane <lane>', 'Filter by lane')
    .option('--limit <n>', 'Limit results')
    .action(listAction);

  feat
    .command('delete <slug>')
    .description('Delete a draft feature')
    .action(deleteAction);

  feat
    .command('available')
    .description('Show claimable features')
    .action(availableAction);

  feat
    .command('pick <slug>')
    .description('Claim feature and export spec to repo')
    .action(pickAction);

  feat
    .command('release')
    .description('Release current feature back to ready')
    .action(releaseAction);

  feat
    .command('done')
    .description('Mark current feature as complete')
    .action(doneAction);
}
