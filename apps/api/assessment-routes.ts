import type {Express,Request,Response} from 'express';
import type {Database} from './db.ts';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {access} from 'node:fs/promises';
import {z} from 'zod';
import {deriveMotivation,deriveInput,ruleCatalog,validateFormalPublication} from '@qilun/assessment-engine/rules.ts';
import {experiment,experimentInput} from '@qilun/assessment-engine/experimental.ts';
import {replicaCatalog,replicaScoreInput,scoreExternalStrengthV3,validateReplicaAnswers,replicaGaps} from '@qilun/assessment-engine/strength-v3.ts';
import {ghEvidenceCatalog,ghEvidenceInput,scoreGhFirstLayer} from '@qilun/assessment-engine/gh-server-evidence.ts';
import {ghReplayCatalog,scoreGhReportReplay,replayGhFinalMatch,buildGhPositionModel,deriveGhPotentialGroups} from '@qilun/assessment-engine/gh-derived.ts';
import {ghInferenceVersion,scoreGhInferredReport,ghPublicInverseSummary} from '@qilun/assessment-engine/gh-inference.ts';
import {canManageAssessment} from '@qilun/security/assessment-access.ts';
import {loadAssessmentRuntime} from './assessment-product.ts';
import type {AssessmentRuntime} from './assessment-product.ts';
import {qilunStandardRulebook} from '@qilun/assessment-engine/qilun-standard.ts';

export function registerAssessmentRoutes(app:Express,db:Database,localPreview?:{directory:string;tenantId:string},runtime:AssessmentRuntime=loadAssessmentRuntime()){
 // Trained artifacts never enter public assets, responses, or a client bundle.
 // The optional private artifact is read-only and does not unlock publication.
 const inverseModel=runtime.legacy?.model;
 const requireAccess=(req:Request,res:Response)=>{
  // Existing session + CSRF middleware always executes before these handlers.
  const a=res.locals.auth as {tenant_id:string;user_id:string;role:string};
  res.set('Cache-Control','private, no-store');
  if(!canManageAssessment(a.role)){
   res.status(403).json({error:{code:'FORBIDDEN_SCOPE',message:'测评后台仅人才负责人可访问'},request_id:res.locals.requestId});return null;
  }return a;
 };
 const send=(res:Response,data:unknown,status=200)=>res.status(status).json({data,request_id:res.locals.requestId});
 const productRuntime=runtime;
 app.get('/api/v1/assessment/product-rules',(req,res)=>{
  if(!requireAccess(req,res))return;
  send(res,{available:!!productRuntime.standard,rulebook:qilunStandardRulebook,rules_fingerprint:productRuntime.standard?.rules_fingerprint??null,problem:productRuntime.problem??null,validation_summary:productRuntime.legacy?ghPublicInverseSummary(productRuntime.legacy.model):null});
 });
 app.get('/api/v1/assessment/rules',(req,res)=>{if(!requireAccess(req,res))return;send(res,ruleCatalog());});
 app.get('/api/v1/assessment/replication',(req,res)=>{if(!requireAccess(req,res))return;send(res,replicaCatalog());});
 app.get('/api/v1/assessment/gh-evidence',(req,res)=>{if(!requireAccess(req,res))return;res.set('Cache-Control','private, no-store');send(res,ghEvidenceCatalog());});
 app.get('/api/v1/assessment/gh-replay',(req,res)=>{if(!requireAccess(req,res))return;res.set('Cache-Control','private, no-store');send(res,ghReplayCatalog());});
 app.get('/api/v1/assessment/gh-inference',(req,res)=>{
  if(!requireAccess(req,res))return;res.set('Cache-Control','private, no-store');
  send(res,{version:ghInferenceVersion,available:!!inverseModel,summary:inverseModel?ghPublicInverseSummary(inverseModel):null,formal_report_available:false,formal_match_available:false});
 });
 app.post('/api/v1/assessment/gh-inference/score',(req,res)=>{
  if(!requireAccess(req,res))return;res.set('Cache-Control','private, no-store');
  if(!inverseModel){res.status(503).json({error:{code:'INFERENCE_MODEL_UNAVAILABLE',message:'本机尚未载入已核验的离线推算模型；原公式核验仍可使用。'},request_id:res.locals.requestId});return;}
  try{send(res,scoreGhInferredReport(req.body,inverseModel));}catch(e){res.status(400).json({error:{code:'INVALID_GH_INFERENCE_INPUT',message:(e as Error).message},request_id:res.locals.requestId});}
 });
 for(const [path,calculate] of [['score',scoreGhReportReplay],['final-match',replayGhFinalMatch],['position-model',buildGhPositionModel],['potential-groups',deriveGhPotentialGroups]] as const){
  app.post(`/api/v1/assessment/gh-replay/${path}`,(req,res)=>{
   if(!requireAccess(req,res))return;res.set('Cache-Control','private, no-store');
   try{send(res,calculate(req.body));}catch(e){res.status(400).json({error:{code:'INVALID_GH_REPLAY_INPUT',message:(e as Error).message},request_id:res.locals.requestId});}
  });
 }
 app.post('/api/v1/assessment/gh-evidence/score',(req,res)=>{
  if(!requireAccess(req,res))return;
  const input=ghEvidenceInput.parse(req.body);
  res.set('Cache-Control','private, no-store');
  try{send(res,scoreGhFirstLayer(input));}catch(e){res.status(400).json({error:{code:'INVALID_GH_EVIDENCE_INPUT',message:(e as Error).message},request_id:res.locals.requestId});}
 });
 app.get('/api/v1/assessment/layout/source/:file',async(req,res)=>{
  const actor=requireAccess(req,res);if(!actor)return;
  // Private source PDFs are never a global, cross-tenant fixture. This optional
  // local preview is off in normal startup and scoped to one explicit tenant.
  if(!localPreview||actor.tenant_id!==localPreview.tenantId||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'')){
   res.status(404).json({error:{code:'LOCAL_SOURCE_UNAVAILABLE',message:'原稿对照仅在指定的本机核验环境启用'}});return;
  }
  const file=String(req.params.file);
  if(!/^(data|talent-(0[1-9]|10))\.svg$/.test(file)){res.status(404).json({error:{code:'NOT_FOUND',message:'无此原稿页面'}});return;}
  const path=resolve(localPreview.directory,file);
  try{await access(path);}catch{res.status(404).json({error:{code:'LOCAL_SOURCE_UNAVAILABLE',message:'本机未录入对应私人原稿，留白模板仍可使用'}});return;}
  res.set('Cache-Control','private, no-store').type('image/svg+xml').sendFile(path);
 });
 app.post('/api/v1/assessment/replication/score',(req,res)=>{
  if(!requireAccess(req,res))return;
  const input=replicaScoreInput.parse(req.body);
  if(input.mode==='ghrczx_strength_153'){
   res.status(409).json({error:{code:'TARGET_SCORING_UNVERIFIED',message:'旧153题接口不生成正式报告；新版277题基础分请使用独立证据试算入口。',missing:replicaGaps},request_id:res.locals.requestId});return;
  }
  try{validateReplicaAnswers(input.mode,input.answers);}catch{
   res.status(400).json({error:{code:'INVALID_REPLICA_ANSWERS',message:'请使用对应版本的全部180题答案，每题只选1至5。'},request_id:res.locals.requestId});return;
  }
  send(res,scoreExternalStrengthV3(input.answers));
 });
 app.post('/api/v1/assessment/rules/experiment',async(req,res)=>{
  const a=requireAccess(req,res);if(!a)return;
  const input=experimentInput.parse(req.body),result=experiment(input);
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  await db.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'assessment.synthetic_experiment',hash]);
  send(res,{...result,input_hash:hash});
 });
 app.post('/api/v1/assessment/rules/validate',(req,res)=>{if(!requireAccess(req,res))return;z.object({}).strict().parse(req.body);send(res,validateFormalPublication());});
 app.post('/api/v1/assessment/rules/derive',async(req,res)=>{
  const a=requireAccess(req,res);if(!a)return;
  const input=deriveInput.parse(req.body),result=deriveMotivation(input);
  const inputHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  await db.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'assessment.rule_verification',inputHash]);
  send(res,{...result,input_hash:inputHash,persisted_as_person_report:false});
 });
 for(const path of ['publish','match']) app.post(`/api/v1/assessment/rules/${path}`,async(req,res)=>{
  const a=requireAccess(req,res);if(!a)return;
  z.object({}).strict().parse(req.body);
  await db.query('INSERT INTO audit_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),a.tenant_id,a.user_id,`assessment.${path}_blocked`]);
  res.status(409).json({error:{code:'MISSING_SCORING_RULES',message:'正式计分/匹配尚不具备条件，未产生分数',missing:validateFormalPublication().missing},request_id:res.locals.requestId});
 });
}
