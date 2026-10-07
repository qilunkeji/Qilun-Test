import {useState} from 'react';
import {canManageAssessment} from '../../../packages/security/assessment-access.ts';
import {AssessmentReplica} from './assessment-replica.tsx';
import {OriginalReportStudio} from './original-report.tsx';
import {AssessmentRules} from './assessment-rules.tsx';
import {Notice} from './ui.tsx';
import {AssessmentProductRules} from './assessment-product.tsx';

/** Loaded only from the lead-only Settings tab; all data APIs also check role. */
export function AssessmentAdmin({role}:{role:string}) {
 const [section,setSection]=useState('product');
 if(!canManageAssessment(role))return <Notice kind="error">当前账号没有测评后台权限。</Notice>;
 return <>
  <section className="panel no-print"><h2>测评后台</h2><p>仅人才负责人可查看。模板、原理、题库核验与试算不在日常测评中心展示；这里的操作不替代已完成答卷的结果。</p></section>
  <div className="tabbar no-print" aria-label="测评后台栏目">
   {[['product','成品规则 · V1.0'],['original','原版报告 · 版式与留白'],['replica','齐论测评 · 规则核验'],['rules','规则与依据']].map(([id,label])=><button key={id} className={section===id?'active':''} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}
  </div>
  {section==='product'?<AssessmentProductRules/>:section==='original'?<OriginalReportStudio/>:section==='replica'?<AssessmentReplica/>:<AssessmentRules/>}
 </>;
}
