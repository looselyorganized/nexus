import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
} from '../../setup/test-helpers';
import {
  getRoadmap,
  reorderFeatures,
  moveToLane,
} from '../../../services/roadmap.service';
import { ValidationError, NotFoundError } from '../../../lib/errors';
import type { Lane } from '@nexus/shared';

let engineer: { id: string; name: string; email: string };
let project: { id: string; slug: string };

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
  const seed = await seedEngineer();
  engineer = seed.engineer;
  project = await seedProject(engineer.id);
});

// ─── getRoadmap ───

describe('getRoadmap', () => {
  it('returns features grouped by lane', async () => {
    await seedFeature(project.id, engineer.id, { lane: 'now' });
    await seedFeature(project.id, engineer.id, { lane: 'next' });
    await seedFeature(project.id, engineer.id, { lane: 'later' });
    await seedFeature(project.id, engineer.id, { lane: 'icebox' });

    const roadmap = await getRoadmap(project.id);

    expect(roadmap.projectId).toBe(project.id);
    expect(roadmap.lanes.length).toBe(4);

    const laneNames = roadmap.lanes.map((l) => l.lane);
    expect(laneNames).toEqual(['now', 'next', 'later', 'icebox']);

    expect(roadmap.lanes.find((l) => l.lane === 'now')!.features.length).toBe(1);
    expect(roadmap.lanes.find((l) => l.lane === 'next')!.features.length).toBe(1);
    expect(roadmap.lanes.find((l) => l.lane === 'later')!.features.length).toBe(1);
    expect(roadmap.lanes.find((l) => l.lane === 'icebox')!.features.length).toBe(1);
  });

  it('features sorted by priority within lanes', async () => {
    await seedFeature(project.id, engineer.id, { lane: 'now', priority: 3 });
    await seedFeature(project.id, engineer.id, { lane: 'now', priority: 1 });
    await seedFeature(project.id, engineer.id, { lane: 'now', priority: 2 });

    const roadmap = await getRoadmap(project.id);
    const nowLane = roadmap.lanes.find((l) => l.lane === 'now')!;

    expect(nowLane.features.length).toBe(3);
    expect(nowLane.features[0]!.priority).toBe(1);
    expect(nowLane.features[1]!.priority).toBe(2);
    expect(nowLane.features[2]!.priority).toBe(3);
  });

  it('empty lanes still present in result', async () => {
    // No features at all
    const roadmap = await getRoadmap(project.id);

    expect(roadmap.lanes.length).toBe(4);
    const laneNames = roadmap.lanes.map((l) => l.lane);
    expect(laneNames).toEqual(['now', 'next', 'later', 'icebox']);
    roadmap.lanes.forEach((l) => {
      expect(l.features.length).toBe(0);
    });
  });
});

// ─── reorderFeatures ───

describe('reorderFeatures', () => {
  it('updates priorities within lanes', async () => {
    const f1 = await seedFeature(project.id, engineer.id, { lane: 'now', priority: 1 });
    const f2 = await seedFeature(project.id, engineer.id, { lane: 'now', priority: 2 });
    const f3 = await seedFeature(project.id, engineer.id, { lane: 'now', priority: 3 });

    // Reverse order
    const roadmap = await reorderFeatures(project.id, {
      now: [f3.slug, f2.slug, f1.slug],
    });

    const nowLane = roadmap.lanes.find((l) => l.lane === 'now')!;
    expect(nowLane.features[0]!.slug).toBe(f3.slug);
    expect(nowLane.features[0]!.priority).toBe(1);
    expect(nowLane.features[1]!.slug).toBe(f2.slug);
    expect(nowLane.features[1]!.priority).toBe(2);
    expect(nowLane.features[2]!.slug).toBe(f1.slug);
    expect(nowLane.features[2]!.priority).toBe(3);
  });

  it('validates lane names', async () => {
    expect(
      reorderFeatures(project.id, {
        invalidlane: ['some-slug'],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for unknown slug', async () => {
    expect(
      reorderFeatures(project.id, {
        now: ['nonexistent-slug'],
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('moves features between lanes via reorder', async () => {
    const f1 = await seedFeature(project.id, engineer.id, { lane: 'now' });
    const f2 = await seedFeature(project.id, engineer.id, { lane: 'next' });

    // Move both into 'later'
    const roadmap = await reorderFeatures(project.id, {
      later: [f1.slug, f2.slug],
    });

    const laterLane = roadmap.lanes.find((l) => l.lane === 'later')!;
    expect(laterLane.features.length).toBe(2);
    expect(laterLane.features[0]!.slug).toBe(f1.slug);
    expect(laterLane.features[1]!.slug).toBe(f2.slug);
  });
});

// ─── moveToLane ───

describe('moveToLane', () => {
  it('moves feature to different lane', async () => {
    const feature = await seedFeature(project.id, engineer.id, { lane: 'next' });

    const moved = await moveToLane({
      projectId: project.id,
      slug: feature.slug,
      lane: 'now',
    });

    expect(moved.lane).toBe('now');
  });

  it('auto-assigns priority when not specified', async () => {
    // Put two existing features in 'now'
    await seedFeature(project.id, engineer.id, { lane: 'now' });
    await seedFeature(project.id, engineer.id, { lane: 'now' });

    const feature = await seedFeature(project.id, engineer.id, { lane: 'later' });

    const moved = await moveToLane({
      projectId: project.id,
      slug: feature.slug,
      lane: 'now',
    });

    // Should get priority = count of features in 'now' + 1 = 3
    // (2 existing + the feature being moved counts in the query)
    expect(moved.lane).toBe('now');
    expect(moved.priority).toBeGreaterThanOrEqual(2);
  });

  it('uses specified priority when provided', async () => {
    const feature = await seedFeature(project.id, engineer.id, { lane: 'next' });

    const moved = await moveToLane({
      projectId: project.id,
      slug: feature.slug,
      lane: 'now',
      priority: 99,
    });

    expect(moved.lane).toBe('now');
    expect(moved.priority).toBe(99);
  });

  it('validates lane name', async () => {
    const feature = await seedFeature(project.id, engineer.id);

    expect(
      moveToLane({
        projectId: project.id,
        slug: feature.slug,
        lane: 'badlane' as Lane,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for unknown feature slug', async () => {
    expect(
      moveToLane({
        projectId: project.id,
        slug: 'missing-feature',
        lane: 'now',
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
