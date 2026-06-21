const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyReferences } = require('./request-attachment-orphan-audit');

test('classifies parent, session, cleanup, orphan and broken references', () => {
  const result = classifyReferences(
    new Set(['formal', 'session', 'cleanup', 'orphan']),
    new Set(['formal', 'broken']),
    new Set(['session']),
    new Set(['cleanup'])
  );
  assert.deepEqual(result.formal, ['formal']);
  assert.deepEqual(result.sessions, ['session']);
  assert.deepEqual(result.cleanup, ['cleanup']);
  assert.deepEqual(result.orphans, ['orphan']);
  assert.deepEqual(result.brokenReferences, ['broken']);
});
