import { validateRoadmap } from '../../src/backend/roadmap-validator';

describe('roadmap validator', () => {
  test('orders tasks by dependencies instead of the model order field', () => {
    const result = validateRoadmap({
      version: '1.0.0',
      summary: 'Linear plan',
      tasks: [
        { id: 'c', title: 'C', description: '', priority: 'low', dependencies: ['b'], order: 1 },
        { id: 'a', title: 'A', description: '', priority: 'high', dependencies: [], order: 3 },
        { id: 'b', title: 'B', description: '', priority: 'medium', dependencies: ['a'], order: 2 }
      ]
    });

    expect(result).toMatchObject({ ok: true, orderedTaskIds: ['a', 'b', 'c'] });
  });

  test('allows independent tasks to become ready together', () => {
    const result = validateRoadmap({
      version: '1.0.0',
      summary: 'Parallel plan',
      tasks: [
        { id: 'a', title: 'A', description: '', priority: 'medium', dependencies: [] },
        { id: 'b', title: 'B', description: '', priority: 'medium', dependencies: [] }
      ]
    });

    expect(result.ok).toBe(true);
    expect(result.orderedTaskIds).toEqual(['a', 'b']);
  });

  test('rejects missing dependencies and cycles', () => {
    expect(validateRoadmap({ version: '1.0.0', summary: 'Invalid', tasks: [{ id: 'a', title: 'A', description: '', priority: 'low', dependencies: ['missing'] }] }).ok).toBe(false);
    expect(validateRoadmap({
      version: '1.0.0',
      summary: 'Cycle',
      tasks: [
        { id: 'a', title: 'A', description: '', priority: 'low', dependencies: ['b'] },
        { id: 'b', title: 'B', description: '', priority: 'low', dependencies: ['a'] }
      ]
    }).message).toContain('circular');
  });
});