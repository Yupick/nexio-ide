import type { Roadmap, RoadmapEntry } from '../shared/types';

export interface RoadmapValidationResult {
  ok: boolean;
  message: string;
  orderedTaskIds: string[];
}

export function validateRoadmap(roadmap: Roadmap): RoadmapValidationResult {
  const tasks = Array.isArray(roadmap?.tasks) ? roadmap.tasks : [];
  if (tasks.length === 0) {
    return { ok: false, message: 'El roadmap debe contener al menos una tarea.', orderedTaskIds: [] };
  }

  const byId = new Map<string, RoadmapEntry>();
  for (const task of tasks) {
    if (!task.id?.trim()) {
      return { ok: false, message: 'Cada tarea del roadmap debe tener un id.', orderedTaskIds: [] };
    }
    if (byId.has(task.id)) {
      return { ok: false, message: `El roadmap contiene el id duplicado ${task.id}.`, orderedTaskIds: [] };
    }
    byId.set(task.id, task);
  }

  const indegree = new Map<string, number>(tasks.map((task) => [task.id, 0]));
  const dependents = new Map<string, string[]>(tasks.map((task) => [task.id, []]));
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!byId.has(dependency)) {
        return { ok: false, message: `La tarea ${task.id} depende de ${dependency}, que no existe.`, orderedTaskIds: [] };
      }
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      dependents.get(dependency)?.push(task.id);
    }
  }

  const ready = tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id);
  const orderedTaskIds: string[] = [];
  while (ready.length > 0) {
    const taskId = ready.shift();
    if (!taskId) {
      continue;
    }
    orderedTaskIds.push(taskId);
    for (const dependent of dependents.get(taskId) ?? []) {
      const nextDegree = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, nextDegree);
      if (nextDegree === 0) {
        ready.push(dependent);
      }
    }
  }

  if (orderedTaskIds.length !== tasks.length) {
    return { ok: false, message: 'El roadmap contiene una dependencia circular.', orderedTaskIds: [] };
  }

  return { ok: true, message: 'Roadmap válido.', orderedTaskIds };
}