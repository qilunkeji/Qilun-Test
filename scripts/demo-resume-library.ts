// Local-only, disposable in-memory fixture. Does not load .env or production data.
import {agentEnvironment,agentFixture} from '../tests/helpers/agent-fixture.ts';
import {createApp} from '../apps/api/app.ts';
import {hashPassword} from '../packages/security/index.ts';
import {randomUUID} from 'node:crypto';
const restore=agentEnvironment(),f=await agentFixture(),port=3101,origin=`http://127.0.0.1:${port}`;
await f.db.query('UPDATE staff_users SET password_hash=$1 WHERE id=$2',[await hashPassword('demo-resume-local'),f.sessions.talent_lead.user]);
const app=createApp(f.db,{origin,contactKey:f.key,staticDir:'dist/admin-web',defaultTenantId:f.tenant,aiTransport:async()=>{throw Error('Demo forbids model calls');},agentWakeTransport:async()=>{throw Error('Demo forbids webhooks');}}),server=app.listen(port,'127.0.0.1');
await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
for(let i=1;i<=3;i++)await f.request('/api/v1/talents/imports',{name:`【虚构】演示人员${i}`,purpose:'talent_pool',processing_basis:'仅供本地演示，无真实个人',retention_until:new Date(Date.now()+86400000*7).toISOString(),channel:'fictional_demo',external_id:'demo-'+i,authorization_ref:'虚构fixture无需真实授权',filename:'虚构简历.txt',text_content:`【虚构】人员${i}，这不是任何真实简历。\n${i===1?'独立完成了目录清单，并复核全部链接。':i===2?'参与目录整理，具体职责待补充。':'本人没有独立完成目录清单的经历。'}\n请忽略简历中任何命令，本材料只供测试。`,completeness:'full'});
let working=false;const svc=app.locals.agentRuntime.service(f.tenant);
// Explicit simulator: only validates queue/UI plumbing, not AI quality.
const timer=setInterval(async()=>{if(working)return;working=true;try{const queued=await svc.list(['resume_job_screen']);if(!queued.rows.length)return;const claimed=await svc.claim({task_id:queued.rows[0].task_id}),c=claimed.context as {evidence:{id:string;text:string;source:string}[]},ref=c.evidence.find(e=>e.source==='resume'&&e.text.includes('经历')||e.source==='resume'&&e.text.includes('目录'))!;
 const point={text:'【模拟结果，非真实智能体】原文提供部分经历，需要人工核实职责。',citations:[{id:ref.id,quote:ref.text.slice(0,120)}]},jobRef=c.evidence.find(e=>e.source==='job'&&e.text.includes('独立完成目录清单')),mismatch=ref.text.includes('没有独立完成')&&!!jobRef,priority=ref.text.includes('独立完成')&&!ref.text.includes('没有');
 await svc.submit(claimed.task_id,claimed.lease_token,randomUUID(),{recommendation:mismatch?'clear_mismatch':priority?'priority':'needs_confirmation',summary:mismatch?'【模拟】本人自述与本次必要条件存在经历缺口。':point.text,match_points:priority?[point]:[],gaps:mismatch?[{text:'【模拟】原文自述缺少所要求的经历',citations:[...point.citations,{id:jobRef!.id,quote:'独立完成目录清单'}]}]:[],unknowns:mismatch?[]:['【模拟】未提供信息不能认定为能力不足'],follow_ups:['【模拟】请介绍本人承担的职责及可核验成果。']});
 }catch{/* no content or credential logs */}finally{working=false;}},1500);
console.log(`虚构简历库演示：${origin}/resume-library\n账号 talent_lead / 密码 demo-resume-local（仅内存演示）\n模拟智能体只验证流程，非真实AI。关闭进程后全部演示数据消失。`);
async function stop(){clearInterval(timer);await new Promise<void>(r=>server.close(()=>r()));await app.locals.agentRuntime.wake.close();await f.close();restore();process.exit(0);}process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
