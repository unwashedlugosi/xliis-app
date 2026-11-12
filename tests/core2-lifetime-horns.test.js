const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/core2-horns');
const { SHOWS, opaqueId, badgeIds, fetchHornsByIds, BADGE_PAGE_SIZE, BADGE_MAX_PAGES } = handler;
const now = Date.parse('2026-11-12T20:00:00Z');
const row = (device_id = 'installation-one', overrides = {}) => ({ device_id,
  event: 'session_end', show_id: SHOWS[0], created_at: '2026-11-10T12:00:00Z',
  metadata: { duration_seconds: 60 }, ...overrides });
const read = (ids, request) => fetchHornsByIds(ids, now, null, Date.now() + 4000, request, 'https://existing.invalid');
const id = opaqueId('installation-one'), other = opaqueId('installation-two');

test('opaque ID list is bounded, canonical and unambiguous', () => {
  assert.deepEqual(badgeIds(`${id},${other}`), [id, other]);
  for (const input of [null, undefined, '', [], id + ',' + id, id.toUpperCase(), 'raw-installation', Array(9).fill(id).join(',')]) assert.equal(badgeIds(input), null);
});

test('historical measured evidence earns only the requested identity, regardless of current show', async () => {
  const out = await read([id, other], async (url, options) => {
    const p = new URL(url).searchParams;
    assert.equal(options.method, 'GET');
    assert.equal(p.get('event'), 'eq.session_end');
    assert.equal(p.get('order'), 'created_at.asc,id.asc');
    assert.ok(p.getAll('created_at').some(x => x === 'gte.2026-11-09T06:11:14.000Z'));
    assert.equal(p.get('show_id'), `in.(${SHOWS.join(',')})`);
    return { data: [row(), row('unrequested-identity')] };
  });
  assert.deepEqual(out, [{listener_id:id,horns_1973_listened:true},{listener_id:other,horns_1973_listened:null}]);
  assert.ok(!JSON.stringify(out).includes('installation'));
});

test('play attempts, zero duration, future, prelaunch and test evidence cannot earn a badge', async () => {
  const invalid = [row(undefined,{event:'show_play'}),row(undefined,{metadata:{duration_seconds:0}}),
    row(undefined,{metadata:{duration_seconds:'90'}}),row(undefined,{metadata:{duration_seconds:86401}}),
    row(undefined,{created_at:'2026-11-08T12:00:00Z'}),row(undefined,{created_at:'2026-11-13T12:00:00Z'}),
    row(undefined,{show_id:'another-show'}),row(undefined,{collection:'test harness'})];
  assert.equal((await read([id],async()=>({data:invalid})))[0].horns_1973_listened,null);
});

test('older earned evidence survives later invalid/zero events', async () => {
  const out = await read([id],async()=>({data:[row(),row(undefined,{created_at:'2026-11-12T19:00:00Z',metadata:{duration_seconds:0}})]}));
  assert.equal(out[0].horns_1973_listened,true);
});

test('paging crosses unrelated historical records without leaking their identities', async () => {
  let calls=0;
  const out=await read([id],async url=>{
    assert.equal(new URL(url).searchParams.get('offset'),String(calls*BADGE_PAGE_SIZE));
    return {data:calls++===0?Array.from({length:BADGE_PAGE_SIZE},()=>row('other-device')):[row()]};
  });
  assert.equal(calls,2);assert.equal(out[0].horns_1973_listened,true);
});

test('known positives survive a later timeout; unresolved history remains unknown', async () => {
  let calls=0;
  const out=await read([id,other],async()=>{
    if(calls++>0)throw new Error('timeout');
    return {data:Array.from({length:BADGE_PAGE_SIZE},()=>row())};
  });
  assert.deepEqual(out,[{listener_id:id,horns_1973_listened:true},{listener_id:other,horns_1973_listened:null}]);
});

test('malformed, empty and bounded exhaustion never claim lifetime absence', async () => {
  for(const data of [null,{},[],Array(BADGE_PAGE_SIZE+1).fill(row())]) assert.equal((await read([id],async()=>({data})))[0].horns_1973_listened,null);
  let calls=0;
  const out=await read([id],async()=>{calls++;return {data:Array(BADGE_PAGE_SIZE).fill(row('unrelated'))};});
  assert.equal(calls,BADGE_MAX_PAGES);assert.equal(out[0].horns_1973_listened,null);
});

test('expired request budget performs no lookup', async () => {
  const out=await fetchHornsByIds([id],now,null,Date.now()-1,()=>{throw new Error('must not call')},'https://existing.invalid');
  assert.equal(out[0].horns_1973_listened,null);
});

test('endpoint validates before fetching and returns exact timestamped per-ID contract', async () => {
  const previous=globalThis.fetch;let calls=0;
  const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=body}});
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify([row()]));};
  try {
    for(const req of [{method:'POST',query:{ids:id}},{method:'GET',query:{ids:'bad'}}]){
      const res=response();await handler(req,res);assert.ok([400,405].includes(res.statusCode));
    }
    assert.equal(calls,0);
    const res=response();await handler({method:'GET',query:{ids:`${id},${other}`}},res);
    assert.equal(res.statusCode,200);assert.match(res.headers['Cache-Control'],/no-store/);
    const data=JSON.parse(res.body);assert.equal(data.schema_version,1);
    assert.equal(Date.parse(data.valid_until)-Date.parse(data.evaluated_at),30000);
    assert.deepEqual(data.listeners,[{listener_id:id,horns_1973_listened:true},{listener_id:other,horns_1973_listened:null}]);
    assert.ok(!res.body.includes('installation-one'));
  } finally {globalThis.fetch=previous;}
});

test('continuation reaches a first qualification after the initial global window', async () => {
  const pages=BADGE_PAGE_SIZE*BADGE_MAX_PAGES;
  const first=await read([id],async()=>({data:Array(BADGE_PAGE_SIZE).fill(row('unrelated'))}));
  assert.equal(first.next_offset,pages);
  const next=await fetchHornsByIds([id],now,null,Date.now()+4000,async url=>{
    assert.equal(new URL(url).searchParams.get('offset'),String(pages));
    return {data:[row()]};
  },'https://existing.invalid',first.next_offset);
  assert.equal(next[0].horns_1973_listened,true);assert.equal(next.next_offset,null);
});

test('continuation validates exact bounded page offsets and preserves completed progress on failure', async () => {
  const {badgeOffset}=handler;
  assert.equal(badgeOffset(undefined),0);assert.equal(badgeOffset('0'),0);assert.equal(badgeOffset('2048'),2048);
  for(const bad of ['-128','1','01','1.5','1e3','999999999',[],null])assert.equal(badgeOffset(bad),null);
  let calls=0;
  const out=await fetchHornsByIds([id],now,null,Date.now()+4000,async()=>{
    if(calls++===1)throw new Error('timeout');return {data:Array(BADGE_PAGE_SIZE).fill(row('unrelated'))};
  },'https://existing.invalid',2048);
  assert.equal(out.next_offset,2048+BADGE_PAGE_SIZE);
});

test('slow streaming upstream is bounded and returns unknown without fabricating evidence', async () => {
  const {requestJSON}=require('../api/core2-listeners')._test;
  const start=Date.now();
  const fakeFetch=async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('['));}}));
  const out=await fetchHornsByIds([id],now,fakeFetch,Date.now()+25,requestJSON,'https://existing.invalid');
  assert.equal(out[0].horns_1973_listened,null);assert.equal(out.next_offset,0);
  assert.ok(Date.now()-start<500,'slow upstream exceeded bounded budget');
});
