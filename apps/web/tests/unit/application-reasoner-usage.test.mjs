import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createUsageParser, decideApplicationStep } from '../../scripts/application-browser/reasoner.mjs';

const event = usage => JSON.stringify({ type: 'turn.completed', usage });
const missing = { inputTokens: null, cachedInputTokens: null, outputTokens: null };

test('usage parser aggregates completed turns across byte chunks without exposing event contents', () => {
  const parser = createUsageParser();
  const text = JSON.stringify({ type: 'item.completed', item: { text: 'Private applicant résumé' }, usage: { input_tokens: 999 } }) + '\n'
    + event({ input_tokens: 12, cached_input_tokens: 7, output_tokens: 3, private: 'secret' }) + '\r\n'
    + event({ input_tokens: 8, cached_input_tokens: 0, output_tokens: 2 });
  for (const byte of Buffer.from(text)) parser.write(Buffer.from([byte]));
  assert.deepEqual(parser.finish(), { inputTokens: 20, cachedInputTokens: 7, outputTokens: 5 });
  assert.deepEqual(parser.finish(), { inputTokens: 20, cachedInputTokens: 7, outputTokens: 5 });
});

test('usage parser discards malformed, oversized and invalid numeric data then recovers', () => {
  const parser = createUsageParser();
  parser.write('malformed\nnull\n[]\n');
  parser.write(event({ input_tokens: '12', cached_input_tokens: -1, output_tokens: 1.5 }) + '\n');
  parser.write(event({ input_tokens: 1e99, cached_input_tokens: null, output_tokens: true }) + '\n');
  assert.deepEqual(parser.finish(), missing);
  parser.write('x'.repeat(64 * 1024));
  for (let i = 0; i < 100; i++) parser.write('y'.repeat(4096));
  parser.write(event({ input_tokens: 999 })); // Still part of the oversized line.
  parser.write('\n' + event({ input_tokens: 0, output_tokens: 4 }) + '\n');
  assert.deepEqual(parser.finish(), { inputTokens: 0, cachedInputTokens: null, outputTokens: 4 });
});

test('usage parser leaves absent usage unknown', () => {
  const parser = createUsageParser();
  parser.write('{"type":"turn.completed"}\n{"type":"turn.failed","error":"private"}');
  assert.deepEqual(parser.finish(), missing);
});

test('decision telemetry is private numeric metadata for success, invalid output and process failure', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reasoner-usage-'));
  const previousExecutable = process.env.AIADAPPLY_CODEX_EXECUTABLE;
  const previousModel = process.env.AIADAPPLY_APPLICATION_MODEL;
  t.after(async () => {
    if (previousExecutable === undefined) delete process.env.AIADAPPLY_CODEX_EXECUTABLE;
    else process.env.AIADAPPLY_CODEX_EXECUTABLE = previousExecutable;
    if (previousModel === undefined) delete process.env.AIADAPPLY_APPLICATION_MODEL;
    else process.env.AIADAPPLY_APPLICATION_MODEL = previousModel;
    await rm(directory, { recursive: true, force: true });
  });
  const executable = path.join(directory, 'fake-codex.mjs');
  process.env.AIADAPPLY_CODEX_EXECUTABLE = executable;
  process.env.AIADAPPLY_APPLICATION_MODEL = 'usage-test-model';
  for (const mode of ['valid', 'invalid', 'failure']) {
    const decision = { outcome: 'blocked', summary: 'Test', confirmationText: '', unresolved: [], actions: [] };
    await writeFile(executable, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({type:'item.completed', item:{text:'PRIVATE-OUTPUT'}}));
  console.log(${JSON.stringify(event({ input_tokens: 50, cached_input_tokens: 20, output_tokens: 8 }))});
  writeFileSync(process.argv[process.argv.indexOf('-o') + 1], ${JSON.stringify(mode === 'invalid' ? '{}' : JSON.stringify(decision))});
  process.exitCode = ${mode === 'failure' ? 1 : 0};
});
`, { mode: 0o700 });
    if (mode === 'valid') assert.equal((await decideApplicationStep({ private: 'PRIVATE-PROMPT' }, directory, mode)).outcome, 'blocked');
    else await assert.rejects(decideApplicationStep({ private: 'PRIVATE-PROMPT' }, directory, mode));
    const usagePath = path.join(directory, 'decisions', `${mode}.usage.json`);
    const usage = JSON.parse(await readFile(usagePath, 'utf8'));
    assert.deepEqual(Object.keys(usage).sort(), ['cachedInputTokens', 'elapsedMs', 'inputTokens', 'model', 'outputTokens', 'success'].sort());
    assert.deepEqual({ ...usage, elapsedMs: 0 }, { inputTokens: 50, cachedInputTokens: 20, outputTokens: 8, model: 'usage-test-model', elapsedMs: 0, success: mode === 'valid' });
    assert.ok(Number.isSafeInteger(usage.elapsedMs) && usage.elapsedMs >= 0);
    assert.equal((await stat(usagePath)).mode & 0o777, 0o600);
  }
  process.env.AIADAPPLY_CODEX_EXECUTABLE = path.join(directory, 'missing-executable');
  await assert.rejects(decideApplicationStep({}, directory, 'missing'));
  const usage = JSON.parse(await readFile(path.join(directory, 'decisions', 'missing.usage.json'), 'utf8'));
  assert.deepEqual({ inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, outputTokens: usage.outputTokens }, missing);
  assert.equal(usage.success, false);
});
