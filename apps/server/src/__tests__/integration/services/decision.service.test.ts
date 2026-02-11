import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  decisionFactory,
} from '../../setup/test-helpers';
import { createDecision, listDecisions } from '../../../services/decision.service';
import { NotFoundError } from '../../../lib/errors';

let engineer: { id: string; name: string; email: string };
let project: { id: string; slug: string };

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
  const seed = await seedEngineer();
  engineer = seed.engineer;
  project = await seedProject(engineer.id);
});

// ─── createDecision ───

describe('createDecision', () => {
  it('creates decision linked to project', async () => {
    const data = decisionFactory();
    const decision = await createDecision({
      projectId: project.id,
      engineerId: engineer.id,
      title: data.title,
      decision: data.decision,
      rationale: data.rationale,
      alternatives: data.alternatives,
    });

    expect(decision.projectId).toBe(project.id);
    expect(decision.engineerId).toBe(engineer.id);
    expect(decision.title).toBe(data.title);
    expect(decision.decision).toBe(data.decision);
    expect(decision.rationale).toBe(data.rationale);
    expect(decision.alternatives).toBe(data.alternatives);
    expect(decision.featureId).toBeNull();
  });

  it('creates decision linked to feature by slug', async () => {
    const feature = await seedFeature(project.id, engineer.id);
    const data = decisionFactory();

    const decision = await createDecision({
      projectId: project.id,
      engineerId: engineer.id,
      title: data.title,
      decision: data.decision,
      featureSlug: feature.slug,
    });

    expect(decision.featureId).toBe(feature.id);
  });

  it('throws NotFoundError for invalid feature slug', async () => {
    const data = decisionFactory();

    expect(
      createDecision({
        projectId: project.id,
        engineerId: engineer.id,
        title: data.title,
        decision: data.decision,
        featureSlug: 'nonexistent-feature-slug',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── listDecisions ───

describe('listDecisions', () => {
  it('returns all decisions for project', async () => {
    const d1 = decisionFactory();
    const d2 = decisionFactory();
    const d3 = decisionFactory();

    await createDecision({ projectId: project.id, engineerId: engineer.id, title: d1.title, decision: d1.decision });
    await createDecision({ projectId: project.id, engineerId: engineer.id, title: d2.title, decision: d2.decision });
    await createDecision({ projectId: project.id, engineerId: engineer.id, title: d3.title, decision: d3.decision });

    const result = await listDecisions({ projectId: project.id });

    expect(result.items.length).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it('filters by feature slug', async () => {
    const feature = await seedFeature(project.id, engineer.id);
    const d1 = decisionFactory();
    const d2 = decisionFactory();

    await createDecision({
      projectId: project.id,
      engineerId: engineer.id,
      title: d1.title,
      decision: d1.decision,
      featureSlug: feature.slug,
    });
    // This one has no feature link
    await createDecision({
      projectId: project.id,
      engineerId: engineer.id,
      title: d2.title,
      decision: d2.decision,
    });

    const result = await listDecisions({
      projectId: project.id,
      featureSlug: feature.slug,
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0]!.title).toBe(d1.title);
  });

  it('pagination works', async () => {
    // Create 3 decisions
    for (let i = 0; i < 3; i++) {
      const d = decisionFactory();
      await createDecision({
        projectId: project.id,
        engineerId: engineer.id,
        title: d.title,
        decision: d.decision,
      });
    }

    const page1 = await listDecisions({ projectId: project.id, limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listDecisions({
      projectId: project.id,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.length).toBe(1);
    expect(page2.hasMore).toBe(false);
  });

  it('throws NotFoundError when filtering by nonexistent feature slug', async () => {
    expect(
      listDecisions({
        projectId: project.id,
        featureSlug: 'does-not-exist',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
