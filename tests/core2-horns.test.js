const test = require('node:test');
const assert = require('node:assert/strict');
const { SHOWS, PAGE_SIZE, MAX_PAGES, qualifies, fetchHorns } = require('../api/core2-horns');
const { buildResponse } = require('../api/core2-listeners')._test;
const at = Date.parse('2026-11-11T16:00:00Z');
const row = { device_id:'listener-a', event:'session_end', metadata:{duration_seconds:42}, show_id:SHOWS[0], created_at:'2026-11-10T15:00:00Z' };
const response = data => new Response(JSON.stringify(data));
test('only exact retained Horns playback evidence qualifies', () => {
 assert.equal(SHOWS.length,8); assert.equal(new Set(SHOWS).size,8);
 for(const show_id of SHOWS)assert.equal(qualifies({...row,show_id},'listener-a',at),true);
 for(const override of [{device_id:'other'}, {event:'show_play'}, {event:'track_play'}, {metadata:{}}, {metadata:{duration_seconds:0}}, {metadata:{duration_seconds:-1}}, {metadata:{duration_seconds:'42'}}, {metadata:{duration_seconds:86401}}, {created_at:'2026-11-08T15:00:00Z'}, {event:'collection_open'}, {event:'jcard_view'},
   {show_id:'gd1973-09-11'}, {show_id:'gd1973-06-24'}, {created_at:'2026-11-12T15:00:00Z'},
   {created_at:'2026-11-10T15:00:00'}, {metadata:{source:'test harness'}}])
   assert.equal(qualifies({...row,...override},'listener-a',at),false);
});
test('history request is exact, bounded, identity-bound and has no rolling lookback', async () => {
 let checked=false;
 const value=await fetchHorns({user_id:'listener-a'},at,null,Date.now()+2000,async(url, options,fetch,ms,cap)=>{
  const q=new URL(url).searchParams;checked=true;
  assert.equal(q.get('device_id'),'eq.listener-a');assert.equal(q.get('event'),'eq.session_end');
  assert.equal(q.get('show_id'),`in.(${SHOWS.join(',')})`);assert.equal(q.get('limit'),String(PAGE_SIZE));
  assert.equal(q.getAll('created_at').length,2);assert.match(q.get('created_at'),/^lte\./);
  assert.ok(ms<=1200);assert.equal(cap,65536);return {data:[row]};
 },'https://example.test');assert.equal(checked,true);assert.equal(value,true);
});
test('missing malformed or unavailable history fails without inventing a badge',async()=>{
 for(const data of [null,{},Array(PAGE_SIZE+1).fill(row),[{...row,device_id:'wrong'}]])assert.equal(await fetchHorns({user_id:'listener-a'},at,null,Date.now()+2000,async()=>({data}),'https://example.test'),null);
 assert.equal(await fetchHorns({user_id:'listener-a'},at,null,Date.now()+2000,async()=>({data:[]}),'https://example.test'),false);
 assert.equal(await fetchHorns({user_id:'listener-a'},at,null,Date.now()+2000,async()=>{throw Error('offline');},'https://example.test'),null);
});
test('active list and swipe card agree; normal clients do not request the badge',async()=>{
 const listeners=['listener-a','listener-b'].map(user_id=>({user_id,show_identifier:'other-show',started_at:'2026-11-11T15:45:00Z',updated_at:'2026-11-11T15:59:00Z'}));
 let badgeQueries=0;
 const fetch=async url=>{
  if(url.includes('get_xlii_current_listener_details'))return response([{active_count:2,evaluated_at:new Date(at).toISOString(),valid_until:new Date(at+30000).toISOString(),active_listeners:listeners}]);
  const q=new URL(url).searchParams;
  if(q.has('show_id')){badgeQueries++;return response(q.get('device_id')==='eq.listener-a'?[row]:[]);}
  return response([]);
 };
 const baseline=await buildResponse(fetch,()=>at,6000,'active');assert.equal(badgeQueries,0);
 assert.equal('horns_1973_listened' in baseline.listeners[0],false);
 for(const scope of ['active','all']){
  const result=await buildResponse(fetch,()=>at,6000,scope,true);
  assert.deepEqual(result.listeners.map(x=>x.horns_1973_listened),[true,false]);
  assert.equal(result.total_count,2);
  assert.doesNotMatch(JSON.stringify(result),/listener-a|listener-b|device_id/);
 }
 assert.equal(badgeQueries,4);
});

test('rejected newest row does not hide older measured playback, even across a page', async()=>{
 const invalid={...row,metadata:{duration_seconds:42,source:'test harness'}};
 for(const pages of [[[invalid,row]],[Array(PAGE_SIZE).fill(invalid),[row]]]) {
  let calls=0;
  const result=await fetchHorns({user_id:'listener-a'},at,null,Date.now()+2000,async(url)=>{
   assert.equal(new URL(url).searchParams.get('offset'),String(calls*PAGE_SIZE));
   return {data:pages[calls++]};
  },'https://example.test');
  assert.equal(result,true);assert.equal(calls,pages.length);
 }
});
test('bounded exhaustion is unknown, never claimed no listening',async()=>{
 let calls=0;
 const result=await fetchHorns({user_id:'listener-a'},at,null,Date.now()+2000,async()=>{
  calls++;return {data:Array(PAGE_SIZE).fill({...row,metadata:{duration_seconds:0}})};
 },'https://example.test');assert.equal(result,null);assert.equal(calls,MAX_PAGES);
});
