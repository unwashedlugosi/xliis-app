const assert = require('node:assert/strict');
const test = require('node:test');
const { readQrGeolocation } = require('../lib/qr-geolocation');
const headers = {'x-vercel-ip-city':'S%C3%A3o%20Paulo','x-vercel-ip-country-region':'SP','x-vercel-ip-country':'BR'};
test('edge-only approximate Unicode city and country subdivision; no datacenter/IP', () => {
  assert.equal(readQrGeolocation(headers, false), null);
  assert.deepEqual(readQrGeolocation({...headers,'x-vercel-id':'iad1','x-real-ip':'192.0.2.1','x-vercel-ip-latitude':'1'}, true),
    {source:'vercel',approximate:true,city:'São Paulo',region:'SP',country:'BR'});
  assert.equal(readQrGeolocation({'x-vercel-id':'iad1'}, true),null);
});
test('malformed, oversized, array, control, markup and double-encoded cities are unknown', () => {
  for(const city of ['%ZZ','%2520','<script>','%00','%0A','A'.repeat(65),'%E2%80%AEParis',['Paris']]) {
    assert.equal(readQrGeolocation({'x-vercel-ip-city':city},true),null);
  }
  assert.deepEqual(readQrGeolocation({'x-vercel-ip-city':'Paris','x-vercel-ip-country':'FR','x-vercel-ip-country-region':'toolong'},true),
    {source:'vercel',approximate:true,city:'Paris',region:null,country:'FR'});
  assert.equal(readQrGeolocation({'x-vercel-ip-country-region':'NY'},true),null);
});
for (const kind of ['car','bc']) {
  test(`${kind} enrichment records only allowed coarse fields and keeps redirect/HEAD semantics`, async () => {
    const handler=require(`../api/${kind}`);
    const previousFetch=global.fetch, previousVercel=process.env.VERCEL;
    let body, calls=0;
    global.fetch=async (_url,options)=>{calls++;body=JSON.parse(options.body);return {ok:true};};process.env.VERCEL='1';
    const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},end(){}});
    try {
      const res=response();await handler({method:'GET',headers},res);
      assert.equal(res.statusCode,302);assert.deepEqual(body.p_geo,readQrGeolocation(headers,true));
      assert.equal(body.p_repeat,false);assert.equal(body.created_at,undefined);
      const head=response();await handler({method:'HEAD',headers},head);assert.equal(calls,1);assert.equal(head.statusCode,302);
      global.fetch=async()=>{throw Error('offline');};const failed=response();await handler({method:'GET',headers},failed);assert.equal(failed.statusCode,302);
    } finally {global.fetch=previousFetch;if(previousVercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=previousVercel;}
  });
}

for (const kind of ['car','bc']) {
  test(`${kind} private capture fallback is limited to definitive missing RPC`, async () => {
    const {recordScan}=require(`../api/${kind}`)._test;
    const visitor={id:'123e4567-e89b-42d3-a456-426614174000',repeat:true};
    const geo=readQrGeolocation(headers,true);
    const calls=[];
    await recordScan(visitor, async (url,options)=>{
      calls.push({url,body:JSON.parse(options.body)});
      return calls.length===1 ? {status:404,ok:false,json:async()=>({code:'PGRST202'})} : {status:201,ok:true};
    },100,geo);
    assert.equal(calls.length,2);assert.match(calls[0].url,/rpc\/capture_xlii_qr_scan$/);
    assert.match(calls[1].url,/xlii_analytics$/);assert.equal(calls[1].body.metadata.geo,undefined);
    for(const failure of [async()=>{throw Error('network');},async()=>({status:500,ok:false}),async()=>({status:404,ok:false,json:async()=>({code:'different'})})]) {
      let attempts=0;await assert.rejects(recordScan(visitor,async(...args)=>{attempts++;return failure(...args);},30,geo));assert.equal(attempts,1);
    }
    let attempts=0;
    await assert.rejects(recordScan(visitor,async()=>{attempts++;return {status:404,ok:false,json:()=>new Promise(()=>{})};},20,geo),/timed out/);
    assert.equal(attempts,1);
  });
}
test('city limit is UTF-8 bytes and a late missing-RPC reply cannot replay after timeout', async () => {
  assert.equal(readQrGeolocation({'x-vercel-ip-city':encodeURIComponent('é'.repeat(32))},true).city,'é'.repeat(32));
  assert.equal(readQrGeolocation({'x-vercel-ip-city':encodeURIComponent('é'.repeat(33))},true),null);
  let resolveBody, calls=0;
  await assert.rejects(require('../api/car')._test.recordScan(
    {id:'123e4567-e89b-42d3-a456-426614174000',repeat:false},
    async()=>{calls++;return {status:404,ok:false,json:()=>new Promise(resolve=>{resolveBody=resolve;})};},
    10,readQrGeolocation(headers,true)),/timed out/);
  resolveBody({code:'PGRST202'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);
});
