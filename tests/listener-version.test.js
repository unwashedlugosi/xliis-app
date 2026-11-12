const test=require('node:test'), assert=require('node:assert/strict');
const {appVersionObservation,fetchAppVersion,buildResponse}=require('../api/core2-listeners')._test;
const now=Date.parse('2026-09-29T17:00:00Z');
const row=()=>({device_id:'a',event:'app_version_report',metadata:{app_version:'1.10.33',app_build:'1790597063'},created_at:'2026-09-29T16:00:00Z',received_at:'2026-09-29T16:00:01Z'});
test('native report carries version and capture-bound freshness without identity/build disclosure',()=>{
 assert.deepEqual(appVersionObservation([row()],'a',now),{version:'1.10.33',reported_at:row().created_at,fresh_until:'2026-09-30T16:00:00.000Z'});
});
test('unknown is distinct from no bird: absent, malformed, expired, future, wrong identity and conflicting capture',()=>{
 for(const rows of [[],null,[{...row(),device_id:'other'}],[{...row(),metadata:{app_version:'1.10.33'}}],[{...row(),created_at:'2026-09-28T16:00:00Z',received_at:'2026-09-29T16:00:01Z'}],[{...row(),created_at:'2026-09-30T16:00:00Z'}],[{...row(),received_at:null}],[row(),{...row(),metadata:{app_version:'1.8.0'}}]])assert.equal(appVersionObservation(rows,'a',now),null);
});
test('latest capture wins over delayed arrival or maximum version',()=>{
 const old={...row(),created_at:'2026-09-29T15:00:00Z',metadata:{app_version:'1.10.33',app_build:'2'}};
 const latest={...row(),metadata:{app_version:'1.8.0',app_build:'1'}};
 assert.equal(appVersionObservation([latest,old],'a',now).version,'1.8.0');
});
test('optional query failure returns unknown',async()=>{
 assert.equal(await fetchAppVersion({user_id:'a'},now,async()=>{throw Error('offline')},Date.now()+2000),null);
});
test('full listener response binds version to the exact listener without leaking install identity',async()=>{
 const result=await buildResponse(async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/get_xlii_current_listener_details'))return new Response(JSON.stringify([{evaluated_at:new Date(now).toISOString(),valid_until:new Date(now+30000).toISOString(),active_count:1,active_listeners:[{user_id:'a',started_at:'2026-09-29T16:00:00Z',updated_at:'2026-09-29T16:59:30Z',show_identifier:'show'}]}]));
  if(u.searchParams.get('event')==='eq.app_version_report'){
   assert.equal(u.searchParams.get('device_id'),'eq.a');
   assert.equal(u.searchParams.get('order'),'created_at.desc,id.desc');
   return new Response(JSON.stringify([row()]));
  }
  return new Response('[]');
 },()=>now);
 assert.equal(result.listeners[0].app_version.version,'1.10.33');
 assert.ok(!JSON.stringify(result).includes('device_id'));
});
