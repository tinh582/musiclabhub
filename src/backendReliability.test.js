import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const port = 5199;

async function waitForServer(child) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Server did not become healthy.');
}

describe('backend reliability', () => {
  it('exposes liveness, readiness, request IDs, and JSON 404 responses', async () => {
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), USE_HTTPS: 'false', NODE_ENV: 'test' },
      stdio: 'ignore',
    });

    try {
      const healthResponse = await waitForServer(child);
      const health = await healthResponse.json();
      expect(health).toMatchObject({ ok: true, status: 'healthy' });
      expect(healthResponse.headers.get('x-request-id')).toBeTruthy();

      const readyResponse = await fetch(`http://127.0.0.1:${port}/api/ready`);
      expect(await readyResponse.json()).toMatchObject({ ok: true, status: 'ready' });

      const missingResponse = await fetch(`http://127.0.0.1:${port}/api/missing`);
      expect(missingResponse.status).toBe(404);
      expect(await missingResponse.json()).toMatchObject({ error: 'API route not found.' });
    } finally {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once('exit', resolve);
      });
    }
  }, 10000);
});
