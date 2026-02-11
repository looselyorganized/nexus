import { Command } from 'commander';
import { withAuth } from '../helpers';
import { saveProjectConfig, clearProjectConfig, loadProjectConfigOrThrow } from '../config';
import { output, outputSuccess, formatKeyValue, formatTable } from '../output';

const createAction = withAuth('Failed to create project', async (client, options: {
  name: string;
  slug: string;
  repoUrl?: string;
  repoPath?: string;
}) => {
  const project = await client.createProject({
    name: options.name,
    slug: options.slug,
    repoUrl: options.repoUrl,
    repoPath: options.repoPath ?? process.cwd(),
  });

  output(project, formatKeyValue([
    ['Project', project.name],
    ['Slug', project.slug],
    ['ID', project.id],
  ]));
});

const linkAction = withAuth('Failed to link project', async (client, projectId: string) => {
  const project = await client.getProject(projectId);

  saveProjectConfig({
    projectId: project.id,
    projectName: project.name,
    projectSlug: project.slug,
    linkedAt: new Date().toISOString(),
  });

  outputSuccess(`Linked to project: ${project.name} (${project.slug})`);
});

const unlinkAction = async () => {
  clearProjectConfig();
  outputSuccess('Unlinked from project');
};

const listAction = withAuth('Failed to list projects', async (client) => {
  const projects = await client.listProjects();

  if (projects.length === 0) {
    console.log('  No projects found');
    return;
  }

  output(
    projects,
    formatTable(
      ['Slug', 'Name', 'ID'],
      projects.map((p: any) => [p.slug, p.name, p.id.slice(0, 8)])
    )
  );
});

const infoAction = async () => {
  const config = loadProjectConfigOrThrow();
  output(config, formatKeyValue([
    ['Project', config.projectName],
    ['Slug', config.projectSlug],
    ['ID', config.projectId],
    ['Linked', config.linkedAt],
    ['Active Feature', config.activeFeature ?? 'none'],
  ]));
};

export function registerProjectCommands(program: Command): void {
  const proj = program.command('project').description('Project management');

  proj
    .command('create')
    .description('Create a new project')
    .requiredOption('-n, --name <name>', 'Project name')
    .requiredOption('-s, --slug <slug>', 'Project slug')
    .option('--repo-url <url>', 'Repository URL')
    .option('--repo-path <path>', 'Local repo path')
    .action(createAction);

  proj
    .command('link <project-id>')
    .description('Link current directory to a project')
    .action(linkAction);

  proj
    .command('unlink')
    .description('Unlink current directory from project')
    .action(unlinkAction);

  proj
    .command('list')
    .description('List all projects')
    .action(listAction);

  proj
    .command('info')
    .description('Show current project info')
    .action(infoAction);
}
