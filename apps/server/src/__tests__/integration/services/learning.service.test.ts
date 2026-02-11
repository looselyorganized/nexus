import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  learningFactory,
} from '../../setup/test-helpers';
import { addLearning, listLearnings } from '../../../services/learning.service';
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

// ─── addLearning ───

describe('addLearning', () => {
  it('creates learning linked to feature by slug', async () => {
    const feature = await seedFeature(project.id, engineer.id);
    const data = learningFactory();

    const learning = await addLearning({
      projectId: project.id,
      featureSlug: feature.slug,
      engineerId: engineer.id,
      content: data.content,
    });

    expect(learning.featureId).toBe(feature.id);
    expect(learning.engineerId).toBe(engineer.id);
    expect(learning.content).toBe(data.content);
    expect(learning.id).toBeTruthy();
    expect(learning.createdAt).toBeTruthy();
  });

  it('throws NotFoundError for invalid feature slug', async () => {
    const data = learningFactory();

    expect(
      addLearning({
        projectId: project.id,
        featureSlug: 'nonexistent-feature',
        engineerId: engineer.id,
        content: data.content,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates multiple learnings for same feature', async () => {
    const feature = await seedFeature(project.id, engineer.id);

    const l1 = await addLearning({
      projectId: project.id,
      featureSlug: feature.slug,
      engineerId: engineer.id,
      content: 'Learning 1',
    });

    const l2 = await addLearning({
      projectId: project.id,
      featureSlug: feature.slug,
      engineerId: engineer.id,
      content: 'Learning 2',
    });

    expect(l1.id).not.toBe(l2.id);
    expect(l1.featureId).toBe(l2.featureId);
  });
});

// ─── listLearnings ───

describe('listLearnings', () => {
  it('returns all learnings for feature', async () => {
    const feature = await seedFeature(project.id, engineer.id);

    await addLearning({ projectId: project.id, featureSlug: feature.slug, engineerId: engineer.id, content: 'L1' });
    await addLearning({ projectId: project.id, featureSlug: feature.slug, engineerId: engineer.id, content: 'L2' });
    await addLearning({ projectId: project.id, featureSlug: feature.slug, engineerId: engineer.id, content: 'L3' });

    const result = await listLearnings({
      projectId: project.id,
      featureSlug: feature.slug,
    });

    expect(result.items.length).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it('pagination works', async () => {
    const feature = await seedFeature(project.id, engineer.id);

    for (let i = 0; i < 3; i++) {
      await addLearning({
        projectId: project.id,
        featureSlug: feature.slug,
        engineerId: engineer.id,
        content: `Learning ${i + 1}`,
      });
    }

    const page1 = await listLearnings({
      projectId: project.id,
      featureSlug: feature.slug,
      limit: 2,
    });
    expect(page1.items.length).toBe(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listLearnings({
      projectId: project.id,
      featureSlug: feature.slug,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.length).toBe(1);
    expect(page2.hasMore).toBe(false);
  });

  it('throws NotFoundError for nonexistent feature slug', async () => {
    expect(
      listLearnings({
        projectId: project.id,
        featureSlug: 'does-not-exist',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
