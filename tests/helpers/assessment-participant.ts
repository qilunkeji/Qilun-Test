import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import type {agentFixture} from './agent-fixture.ts';
export const fictionalProfile={name:'【虚构】外部本人',phone:'13800000000',birth_date:'1990-06-15'};
// Exercise the real shared creation + enrollment flow in integration fixtures.
export async function createParticipant(f:Awaited<ReturnType<typeof agentFixture>>,input:Record<string,unknown>,profile=fictionalProfile){
 const r=await f.request('/api/v1/assessment/invites',input);assert.equal(r.status,201);
 assert.equal(r.body.data.pin,undefined);
 const shared={token:r.body.data.url.split('#')[1]},entry=(await f.request('/api/v1/public/assessment/entry/open',shared,null)).body.data;
 const enrolled=await f.request('/api/v1/public/assessment/entry/enroll',{...shared,profile,participant_key:randomBytes(32).toString('base64url'),consent_version:entry.consent_version,accepted:true},null);assert.equal(enrolled.status,201);
 const auth=enrolled.body.data,opened=(await f.request('/api/v1/public/assessment/open',auth,null)).body.data;
 return {...r.body.data,id:opened.id,entry_id:r.body.data.id,auth,url:`${f.origin}/h5/#${auth.token}`};
}
