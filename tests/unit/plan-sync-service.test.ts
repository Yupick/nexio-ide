import { DebouncedPlanSyncService } from '../../src/backend/plan-sync-service';
import type { PlanGenerationRequest, PlanGenerationResult } from '../../src/shared/types';

const request: PlanGenerationRequest = {
  sessionId: 'session-sync',
  transcript: {
    sessionId: 'session-sync',
    messages: [{ role: 'user', text: 'Actualizar el plan' }]
  }
};

describe('debounced plan sync service', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('cancels a pending revision when a newer message is scheduled', () => {
    jest.useFakeTimers();
    const service = new DebouncedPlanSyncService(500);
    const results: PlanGenerationResult[] = [];

    service.schedule(request, (result) => results.push(result));
    service.schedule({ ...request, transcript: { ...request.transcript, messages: [...request.transcript.messages, { role: 'user', text: 'Aclarar el alcance' }] } }, (result) => results.push(result));
    jest.advanceTimersByTime(499);
    expect(results).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(results).toHaveLength(1);
  });

  test('cancels a session without invoking the callback', () => {
    jest.useFakeTimers();
    const service = new DebouncedPlanSyncService(500);
    const callback = jest.fn();

    service.schedule(request, callback);
    service.cancel(request.sessionId);
    jest.advanceTimersByTime(500);

    expect(callback).not.toHaveBeenCalled();
  });

  test('resolves a superseded promise instead of leaving IPC callers pending', async () => {
    jest.useFakeTimers();
    const service = new DebouncedPlanSyncService(500);
    const runner = jest.fn().mockResolvedValue({ ok: true, message: 'Plan listo' });
    const first = service.schedulePromise(request, runner);
    const secondRequest = { ...request, transcript: { ...request.transcript, messages: [{ role: 'user' as const, text: 'Nueva revisión' }] } };
    const second = service.schedulePromise(secondRequest, runner);

    await expect(first).resolves.toMatchObject({ ok: false, message: expect.stringContaining('reemplazada') });
    jest.advanceTimersByTime(500);
    await expect(second).resolves.toMatchObject({ ok: true, message: 'Plan listo' });
    expect(runner).toHaveBeenCalledTimes(1);
  });
});