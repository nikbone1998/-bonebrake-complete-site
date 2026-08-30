import test from 'node:test';
import assert from 'node:assert/strict';
import health from '../api/health.js';
import audit from '../api/audit.js';
import lead from '../api/lead.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.ended = true; return this; },
    end(value) { this.body = value; this.ended = true; return this; }
  };
}

test('health endpoint identifies Phase 8', () => {
  const res = response();
  health({ method:'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.build, 'phase8-operational-platform');
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
});

test('health rejects writes', () => {
  const res = response();
  health({ method:'POST' }, res);
  assert.equal(res.statusCode, 405);
});

test('audit rejects unsupported methods', async () => {
  const res = response();
  await audit({ method:'GET' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error, 'method_not_allowed');
});

test('audit rejects invalid URLs', async () => {
  const res = response();
  await audit({ method:'POST', body:{ url:'not-a-url' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid_url');
});

test('audit blocks loopback/private targets before fetch', async () => {
  const res = response();
  await audit({ method:'POST', body:{ url:'http://127.0.0.1/' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'private_target');
});

test('lead endpoint rejects invalid leads', async () => {
  const res = response();
  await lead({ method:'POST', body:{ name:'Test', email:'invalid' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'invalid_lead');
});

test('lead honeypot returns a neutral success without delivery', async () => {
  const res = response();
  await lead({ method:'POST', body:{ _honey:'bot-filled', name:'Bot', email:'bot@example.com' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('lead adapter is explicit when no server delivery provider is configured', async () => {
  const original = process.env.LEAD_WEBHOOK_URL;
  delete process.env.LEAD_WEBHOOK_URL;
  const res = response();
  await lead({ method:'POST', body:{ name:'Real Person', email:'person@example.com' } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'delivery_adapter_unconfigured');
  assert.equal(res.body.fallback, 'client_provider');
  if (original !== undefined) process.env.LEAD_WEBHOOK_URL = original;
});
