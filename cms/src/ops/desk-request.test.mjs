import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { desk } from '../components/desk.js';

test('切换名单保留取消原因，二十秒超时覆盖仍在读取的响应正文', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mock = t.mock.method(globalThis, 'fetch', () => assert.fail('意外的网络请求'));
  for (const superseded of [true, false]) {
    const reading = Promise.withResolvers();
    mock.mock.mockImplementationOnce(async (_, { signal }) => ({
      status: 200, ok: true,
      json() {
        reading.resolve(signal);
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once:true }));
      },
    }));
    const previous = new AbortController();
    const request = desk('staff/registrations', undefined, {page:'2'}, previous.signal);
    const body = await reading.promise;
    t.mock.timers.tick(19999);
    assert.equal(body.aborted, false);
    if (superseded) {
      const reason = new Error('已切换筛选条件');
      previous.abort(reason);
      await assert.rejects(request, error => error === reason);
    } else {
      t.mock.timers.tick(1);
      await assert.rejects(request, /超时/);
    }
    assert.ok(body.aborted);
  }
});

test('登录失效、代理错误和审核冲突保留 HTTP 状态；无效成功响应也会报错', async t => {
  const mock = t.mock.method(globalThis, 'fetch', () => assert.fail('意外的网络请求'));
  for (const [status, body] of [[401, ''], [502, '<html>temporarily unavailable</html>'], [409, '{"error":"该报名已处理"}']]) {
    mock.mock.mockImplementationOnce(async () => new Response(body, { status }));
    await assert.rejects(desk('staff/registrations/fixture/review', {status:'approved'}), error =>
      error.status === status && (status !== 409 || error.message === '该报名已处理'));
  }
  mock.mock.mockImplementationOnce(async () => new Response('<html>unavailable</html>'));
  await assert.rejects(desk('staff/events'), /连接|响应/);
});

test('后台 desk 将客户端取消传给名单读取，已提交的审核继续完成并返回社区状态', async t => {
  const temp = mkdtempSync(join(tmpdir(), '01player-desk-request-'));
  t.after(() => rmSync(temp, {recursive:true, force:true}));
  const values = {CLUB_CMS_DATA:temp, COMMUNITY_INTERNAL_ORIGIN:'http://fixture.invalid', COMMUNITY_STAFF_BRIDGE_SECRET:'fixture-only'};
  for (const [key,value] of Object.entries(values)) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  const { endpoints } = await import('../content/endpoints.mjs');
  const handler = endpoints.find(endpoint => endpoint.path === '/desk').handler;
  const mock = t.mock.method(globalThis, 'fetch', () => assert.fail('意外的网络请求'));
  for (const method of ['GET','POST']) {
    const read = method === 'GET';
    const path = read ? 'staff/registrations' : 'staff/registrations/fixture/review';
    const action = read ? {query:{page:'2',pageSize:'20'}} : {data:{status:'approved'}};
    const client = new AbortController();
    const req = new Request('http://fixture.invalid/cms-api/desk', {
      method:'POST', headers:{'x-01-desk':'1'}, body:JSON.stringify({path,method,...action}), signal:client.signal,
    });
    req.user = {collection:'staff', role:'operator', id:'fixture-operator'};
    const started = Promise.withResolvers(), reply = Promise.withResolvers();
    mock.mock.mockImplementationOnce((url, options) => {
      started.resolve({url,options});
      options.signal.addEventListener('abort', () => reply.reject(options.signal.reason), {once:true});
      return reply.promise;
    });
    const response = handler(req);
    const {url,options} = await started.promise;
    assert.equal(url.pathname, '/api/community/' + path);
    assert.equal(options.method, method);
    client.abort();
    assert.equal(options.signal.aborted, read);
    if (read) {
      assert.equal(url.searchParams.get('page'), '2');
      await response;
    } else {
      assert.deepEqual(JSON.parse(options.body), action.data);
      reply.resolve(Response.json({error:'已处理'}, {status:409}));
      const result = await response;
      assert.equal(result.status, 409);
      assert.deepEqual(await result.json(), {error:'已处理'});
    }
  }
});
