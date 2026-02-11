import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  request,
  authRequest,
  postJson,
  jsonBody,
} from '../setup/test-helpers';
import { eq } from 'drizzle-orm';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('Project membership E2E', () => {
  it('project creator is lead', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Creator' });
    const project = await seedProject(engineer.id);

    // GET project to check membership
    const res = await authRequest(`/api/projects/${project.id}`, apiKey);
    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: any }>(res);

    const creatorMember = body.data.members.find(
      (m: any) => m.engineerId === engineer.id
    );
    expect(creatorMember).toBeDefined();
    expect(creatorMember.role).toBe('lead');
  });

  it('lead adds member successfully', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer({ name: 'Lead' });
    const { engineer: member } = await seedEngineer({ name: 'Member' });
    const project = await seedProject(lead.id);

    // Lead adds member
    const addRes = await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: member.id,
      role: 'member',
    });
    expect(addRes.status).toBe(201);
    const addBody = await jsonBody<{ data: any }>(addRes);
    expect(addBody.data.engineerId).toBe(member.id);
    expect(addBody.data.role).toBe('member');

    // Verify via GET project
    const projectRes = await authRequest(`/api/projects/${project.id}`, leadKey);
    const projectBody = await jsonBody<{ data: any }>(projectRes);
    expect(projectBody.data.members).toHaveLength(2);
    const addedMember = projectBody.data.members.find(
      (m: any) => m.engineerId === member.id
    );
    expect(addedMember).toBeDefined();
    expect(addedMember.role).toBe('member');
  });

  it('member can access project routes', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer({ name: 'Lead' });
    const { engineer: member, apiKey: memberKey } = await seedEngineer({ name: 'Member' });
    const project = await seedProject(lead.id);

    // Add member
    await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: member.id, role: 'member',
    });

    // Member can access GET project
    const projectRes = await authRequest(`/api/projects/${project.id}`, memberKey);
    expect(projectRes.status).toBe(200);

    // Member can list features
    const featuresRes = await authRequest(
      `/api/projects/${project.id}/features`,
      memberKey
    );
    expect(featuresRes.status).toBe(200);

    // Member can create a feature
    const createRes = await postJson(
      `/api/projects/${project.id}/features`,
      memberKey,
      { slug: 'member-feat', title: 'Member Feature', spec: 'Made by member' }
    );
    expect(createRes.status).toBe(201);

    // Member can access roadmap
    const roadmapRes = await authRequest(
      `/api/projects/${project.id}/roadmap`,
      memberKey
    );
    expect(roadmapRes.status).toBe(200);
  });

  it('non-member gets 403 on project routes', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer({ name: 'Lead' });
    const { engineer: outsider, apiKey: outsiderKey } = await seedEngineer({ name: 'Outsider' });
    const project = await seedProject(lead.id);

    // Outsider tries to access project (not a member)
    const projectRes = await authRequest(`/api/projects/${project.id}`, outsiderKey);
    expect(projectRes.status).toBe(403);

    // Outsider tries to list features
    const featuresRes = await authRequest(
      `/api/projects/${project.id}/features`,
      outsiderKey
    );
    expect(featuresRes.status).toBe(403);

    // Outsider tries to create a feature
    const createRes = await postJson(
      `/api/projects/${project.id}/features`,
      outsiderKey,
      { slug: 'outsider-feat', title: 'Outsider Feature', spec: 'Should fail' }
    );
    expect(createRes.status).toBe(403);

    // Outsider tries to access roadmap
    const roadmapRes = await authRequest(
      `/api/projects/${project.id}/roadmap`,
      outsiderKey
    );
    expect(roadmapRes.status).toBe(403);
  });

  it('admin can access any project without explicit membership', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer({ name: 'Lead' });
    const { engineer: admin, apiKey: adminKey } = await seedEngineer({ name: 'Admin' });
    const project = await seedProject(lead.id);

    // Promote engineer to admin via direct DB update
    const { db } = await import('../../db/connection');
    const { engineers } = await import('../../db/schema');
    await db.update(engineers).set({ role: 'admin' }).where(eq(engineers.id, admin.id));

    // Admin can access project (not a member, but is admin)
    const projectRes = await authRequest(`/api/projects/${project.id}`, adminKey);
    expect(projectRes.status).toBe(200);

    // Admin can list features
    const featuresRes = await authRequest(
      `/api/projects/${project.id}/features`,
      adminKey
    );
    expect(featuresRes.status).toBe(200);

    // Admin can create a feature
    const createRes = await postJson(
      `/api/projects/${project.id}/features`,
      adminKey,
      { slug: 'admin-feat', title: 'Admin Feature', spec: 'Made by admin' }
    );
    expect(createRes.status).toBe(201);

    // Admin can list all projects
    const allProjectsRes = await authRequest('/api/projects', adminKey);
    expect(allProjectsRes.status).toBe(200);
    const allProjects = await jsonBody<{ data: any[] }>(allProjectsRes);
    expect(allProjects.data.length).toBeGreaterThanOrEqual(1);
  });

  it('non-lead member cannot add other members', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer({ name: 'Lead' });
    const { engineer: member, apiKey: memberKey } = await seedEngineer({ name: 'Member' });
    const { engineer: newbie } = await seedEngineer({ name: 'Newbie' });
    const project = await seedProject(lead.id);

    // Add member
    await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: member.id, role: 'member',
    });

    // Member tries to add another member (should fail with 403)
    const addRes = await postJson(`/api/projects/${project.id}/members`, memberKey, {
      engineerId: newbie.id, role: 'member',
    });
    expect(addRes.status).toBe(403);
  });
});
