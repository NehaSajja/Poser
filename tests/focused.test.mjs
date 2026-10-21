import test from 'node:test';
import assert from 'node:assert/strict';
import { recognize } from '../server/recognize.mjs';
import { RECOGNITION_VERSION, resolvedKind } from '../src/recognition.js';
const image = 'data:image/png;base64,AA==';
const answer = (kind, p) => ({ answers: [{ name: 'component', type: 'choice', choice: kind,
  probabilities: [{ value: kind, probability: p }, { value: 'unknown', probability: 1-p }] }] });

test('clear and uncertain decisions each use exactly one model call', async () => {
  for (const p of [.43, .93]) {
    const requests = [];
    const result = await recognize({ image }, { evaluate: async request => { requests.push(request); return answer('input', p); } });
    assert.equal(requests.length, 1);
    assert.equal(result.probabilities[0].probability, p);
    assert.equal(resolvedKind(null, result), p >= .70 ? 'input' : null);
    assert.equal(result.recognitionVersion, RECOGNITION_VERSION);
    assert.ok(result.elapsedMs >= 0);
  }
});

test('the model sees one crop and all choices, without candidate or reference images', async () => {
  await recognize({ image, sceneImage: image, candidates: [{ id: 0, image, emptyOutline: true }], context: [] }, {
    evaluate: async request => {
      assert.deepEqual(request.input, [{ role: 'user', content: [{ type: 'input_image', image_url: image }] }]);
      assert.equal(request.questions.length, 1);
      assert.equal(request.questions[0].choices.length, 9);
      assert.ok(request.questions[0].choices.some(c => c.value === 'input'));
      return answer('container', .95);
    },
  });
});

test('an explicit unknown stays deferred without another attempt', async () => {
  let calls = 0;
  const result = await recognize({ image }, { evaluate: async () => {
    calls++;
    return { answers: [{ name: 'component', type: 'choice', choice: 'unknown', probabilities: [
      { value: 'unknown', probability: .53 }, { value: 'input', probability: .33 }, { value: 'container', probability: .14 },
    ] }] };
  } });
  assert.equal(calls, 1);
  assert.equal(resolvedKind(null, result), null);
});
