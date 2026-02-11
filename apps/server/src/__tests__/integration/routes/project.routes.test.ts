import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  request,
  authRequest,
  postJson,
  jsonBody,
} from '../../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('POST /api/projects', () => {
  it('returns 201 and creates project with creator as lead', async () => {
    const { engineer, apiKey } = await seedEngineer();

    const res = await postJson('/api/projects', apiKey, {
      name: 'My Project',
      slug: 'my-project',
      repoUrl: 'https://github.com/test/repo',
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.name).toBe('My Project');
    expect(body.data.slug).toBe('my-project');
    expect(body.data.id).toBeDefined();
  });

  it('returns project with default branch main', async () => {
    const { apiKey } = await seedEngineer();

    const res = await postJson('/api/projects', apiKey, {
      name: 'Default Branch Project',
      slug: 'default-branch',
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.defaultBranch).toBe('main');
  });

  it('returns 409 for duplicate slug', async () => {
    const { apiKey } = await seedEngineer();
    const slug = `dup-slug-${Date.now()}`;

    await postJson('/api/projects', apiKey, { name: 'First', slug });
    const res = await postJson('/api/projects', apiKey, { name: 'Second', slug });

    expect(res.status).toBe(409);
  });

  it('returns 400 for invalid slug format', async () => {
    const { apiKey } = await seedEngineer();

    const res = await postJson('/api/projects', apiKey, {
      name: 'Bad Slug',
      slug: 'INVALID SLUG!',
    });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Auth', slug: 'no-auth' }),
    });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/projects', () => {
  it('returns projects the engineer is a member of', async () => {
    const { engineer, apiKey } = await seedEngineer();
    await seedProject(engineer.id, { name: 'Proj A', slug: `proj-a-${Date.now()}` });
    await seedProject(engineer.id, { name: 'Proj B', slug: `proj-b-${Date.now()}` });

    const res = await authRequest('/api/projects', apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data.length).toBe(2);
  });

  it('does not return projects the engineer is not a member of', async () => {
    const { engineer: e1 } = await seedEngineer();
    const { apiKey: key2 } = await seedEngineer();

    await seedProject(e1.id, { name: 'Not Mine', slug: `not-mine-${Date.now()}` });

    const res = await authRequest('/api/projects', key2);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data.length).toBe(0);
  });

  it('returns 401 without auth', async () => {
    const res = await request('/api/projects');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/projects/:projectId', () => {
  it('returns 200 with project and members list', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await authRequest(`/api/projects/${project.id}`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.id).toBe(project.id);
    expect(body.data.members).toBeDefined();
    expect(Array.isArray(body.data.members)).toBe(true);
    expect(body.data.members.length).toBeGreaterThanOrEqual(1);
    expect(body.data.members[0].role).toBe('lead');
  });

  it('returns 403 for non-member', async () => {
    const { engineer: e1 } = await seedEngineer();
    const { apiKey: key2 } = await seedEngineer();
    const project = await seedProject(e1.id);

    const res = await authRequest(`/api/projects/${project.id}`, key2);
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent project id', async () => {
    const { apiKey } = await seedEngineer();
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const res = await authRequest(`/api/projects/${fakeId}`, apiKey);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/projects/:projectId/members', () => {
  it('returns 201 and adds member', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer();
    const { engineer: member } = await seedEngineer();
    const project = await seedProject(lead.id);

    const res = await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: member.id,
      role: 'member',
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.engineerId).toBe(member.id);
    expect(body.data.role).toBe('member');
  });

  it('returns 403 when non-lead tries to add member', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer();
    const { engineer: member, apiKey: memberKey } = await seedEngineer();
    const { engineer: newMember } = await seedEngineer();
    const project = await seedProject(lead.id);

    // Add member as non-lead
    await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: member.id,
      role: 'member',
    });

    // Non-lead member tries to add someone
    const res = await postJson(`/api/projects/${project.id}/members`, memberKey, {
      engineerId: newMember.id,
    });

    expect(res.status).toBe(403);
  });

  it('returns 409 for duplicate member', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer();
    const { engineer: member } = await seedEngineer();
    const project = await seedProject(lead.id);

    await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: member.id,
    });

    const res = await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: member.id,
    });

    expect(res.status).toBe(409);
  });

  it('returns 404 for non-existent engineer id', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer();
    const project = await seedProject(lead.id);

    const res = await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: '00000000-0000-0000-0000-000000000000',
    });

    expect(res.status).toBe(404);
  });
});
