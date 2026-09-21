import path from 'node:path';

import type { ResourceContract } from '../shared/types';

export interface ResourceLease {
  readonly owner: string;
  release(): void;
}

export class ResourceLockTimeoutError extends Error {
  public constructor(owner: string, timeoutMs: number) {
    super(`Resource lock timeout for ${owner} after ${timeoutMs} ms.`);
    this.name = 'ResourceLockTimeoutError';
  }
}

interface LockWaiter {
  owner: string;
  request: ResourceContract;
  resolve: (lease: ResourceLease) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface ActiveLock {
  owner: string;
  request: ResourceContract;
}

function normalizePath(resourcePath: string): string {
  const normalized = path.posix.normalize(resourcePath.trim().replaceAll('\\', '/'));
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

function normalizeRequest(request: ResourceContract = {}): ResourceContract {
  return {
    ...(Array.isArray(request.readPaths) ? { readPaths: request.readPaths.filter(Boolean).map(normalizePath) } : {}),
    ...(Array.isArray(request.writePaths) ? { writePaths: request.writePaths.filter(Boolean).map(normalizePath) } : {}),
    ...(Array.isArray(request.resourceKeys) ? { resourceKeys: request.resourceKeys.filter(Boolean).map((key) => key.trim()) } : {})
  };
}

function pathsOverlap(first: string, second: string): boolean {
  return first === second || first.startsWith(`${second}/`) || second.startsWith(`${first}/`);
}

export function resourcesConflict(first: ResourceContract, second: ResourceContract): boolean {
  const firstRequest = normalizeRequest(first);
  const secondRequest = normalizeRequest(second);
  const firstWrites = firstRequest.writePaths ?? [];
  const secondWrites = secondRequest.writePaths ?? [];
  const firstReads = firstRequest.readPaths ?? [];
  const secondReads = secondRequest.readPaths ?? [];

  if (firstWrites.some((writePath) => [...secondWrites, ...secondReads].some((pathValue) => pathsOverlap(writePath, pathValue)))) {
    return true;
  }
  if (secondWrites.some((writePath) => firstReads.some((pathValue) => pathsOverlap(writePath, pathValue)))) {
    return true;
  }

  return (firstRequest.resourceKeys ?? []).some((key) => (secondRequest.resourceKeys ?? []).includes(key));
}

export function hasDeclaredResources(resourceContract: ResourceContract | undefined): boolean {
  if (!resourceContract || typeof resourceContract !== 'object') {
    return false;
  }

  const hasResourceField = ['readPaths', 'writePaths', 'resourceKeys'].some((field) => Object.prototype.hasOwnProperty.call(resourceContract, field));
  const hasResourceValue = [resourceContract.readPaths, resourceContract.writePaths, resourceContract.resourceKeys]
    .some((values) => Array.isArray(values) && values.length > 0);
  return hasResourceField && hasResourceValue;
}

export class ResourceLockManager {
  private readonly activeLocks: ActiveLock[] = [];
  private readonly waiters: LockWaiter[] = [];

  public tryAcquire(owner: string, request: ResourceContract): ResourceLease | undefined {
    const normalizedRequest = normalizeRequest(request);
    if (this.activeLocks.some((active) => resourcesConflict(active.request, normalizedRequest))) {
      return undefined;
    }

    const activeLock: ActiveLock = { owner, request: normalizedRequest };
    this.activeLocks.push(activeLock);
    let released = false;
    return {
      owner,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        const index = this.activeLocks.indexOf(activeLock);
        if (index >= 0) {
          this.activeLocks.splice(index, 1);
        }
        this.drain();
      }
    };
  }

  public acquire(owner: string, request: ResourceContract, timeoutMs = 30_000): Promise<ResourceLease> {
    const immediate = this.tryAcquire(owner, request);
    if (immediate) {
      return Promise.resolve(immediate);
    }

    return new Promise<ResourceLease>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.owner === owner && waiter.resolve === resolve);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        reject(new ResourceLockTimeoutError(owner, timeoutMs));
      }, timeoutMs);
      this.waiters.push({ owner, request: normalizeRequest(request), resolve, reject, timeout });
      this.drain();
    });
  }

  public async withResources<T>(owner: string, request: ResourceContract, action: () => Promise<T>, timeoutMs = 30_000): Promise<T> {
    const lease = await this.acquire(owner, request, timeoutMs);
    try {
      return await action();
    } finally {
      lease.release();
    }
  }

  private drain(): void {
    let index = 0;
    while (index < this.waiters.length) {
      const waiter = this.waiters[index];
      const lease = this.tryAcquire(waiter.owner, waiter.request);
      if (!lease) {
        index += 1;
        continue;
      }

      this.waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(lease);
    }
  }
}