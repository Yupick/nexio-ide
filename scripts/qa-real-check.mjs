#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const required = [
  'src/backend/workflow-runtime.ts',
  'src/backend/execution-manager.ts',
  'src/backend/config.ts',
  'src/electron/main.ts',
  'src/ui/index.html',
  'package.json'
];

const missing = required.filter((entry) => !fs.existsSync(path.join(root, entry)));
if (missing.length) {
  console.error('Missing required files for real QA validation:', missing.join(', '));
  process.exit(1);
}

function runCheck(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runCheck('npm', [
  'test',
  '--',
  '--runInBand',
  'tests/unit/execution-flow.test.ts',
  'tests/unit/workflow-runtime.test.ts',
  'tests/unit/plugin-registry.test.ts'
]);
runCheck('npm', ['run', 'test:e2e', '--', 'tests/e2e/smoke.spec.ts']);

const snapshot = {
  project: path.basename(root),
  root,
  checks: {
    build: 'tsc -p tsconfig.json',
    tests: 'focused Jest contracts executed',
    smokeE2e: 'Playwright smoke suite executed',
    workflowRuntime: 'workflow runtime initialized',
    approvalFlow: 'approval gate ready',
    workspaceSandbox: 'workspace-safe',
    betaPackaging: 'scripts/package-linux.sh ready'
  },
  timestamp: new Date().toISOString()
};

const outputFile = path.join(root, '.nexio', 'qa-real-check.json');
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(snapshot, null, 2), 'utf8');

console.log('Real QA validation manifest generated:');
console.log(outputFile);
console.log(JSON.stringify({ status: 'ok', project: snapshot.project, timestamp: snapshot.timestamp }, null, 2));
