export type InvitationSummaryRow={submitted_at:string|null;revoked_at:string|null;expires_at:string};
export function invitationStats(rows:InvitationSummaryRow[],now=Date.now()){
 return {total:rows.length,completed:rows.filter(r=>r.submitted_at).length,pending:rows.filter(r=>!r.submitted_at&&!r.revoked_at&&new Date(r.expires_at).getTime()>now).length};
}
const auditActions:Record<string,[string,string]>={
 'auth.login':['账号登录','账号'],'auth.iam.bound':['绑定统一账号','账号'],'auth.iam.provisioned':['创建统一账号映射','账号'],'auth.iam.role_updated':['同步统一账号权限','账号'],
 'job.created':['创建岗位','岗位'],'job.version_created':['保存岗位新版本','岗位'],'resume.imported':['导入简历版本','简历'],'contact.read':['审计查看联系方式','人才'],
 'application.created':['建立岗位申请','申请'],'interview.created':['建立面试','面试'],'recruiting.material_saved':['保存公司资料','资料'],'ai.configured':['保存模型配置','功能配置'],
 'assessment.person_created':['建立测评人员','人才'],'assessment.invited':['发起测评邀请','测评'],'assessment.revoked':['撤销测评邀请','测评'],'assessment.deleted':['删除本次测评数据','测评'],'assessment.public_submitted':['完成测评答卷','测评'],
 'project.created':['新建项目组','项目组'],'project.assigned':['调整项目组归类','项目组'],'assessment.archive_bound':['测评关联人才档案','测评'],
 'assessment.public_entry_created':['新建测评公共入口','测评'],'assessment.public_entry_revoked':['停止公共入口登记','测评'],'assessment.public_entry_enrolled':['公共入口建立个人答卷','测评'],
 'assessment.synthetic_experiment':['运行合成试验','合成摘要'],'assessment.rule_verification':['核验计分规则','核验摘要'],'access.denied':['拒绝越权访问','访问'],
};
export function auditDisplay(action:string){
 const known=auditActions[action];
 return {label:known?.[0]??action,object:known?.[1]??'未解释事件',result:action==='access.denied'?'已拒绝':action.endsWith('_blocked')?'已阻止':known?'已记录':'未知 · 待解释',known:!!known};
}
export function sourceLabel(value:string){return ({manual:'人工授权导入',assessment_invite:'测评邀请建档'} as Record<string,string>)[value]??(value?`${value}（来源说明待核）`:'来源未知');}
export function privacySummary(basis:string|null|undefined,authorization:string|null|undefined,until:string|null|undefined,now=Date.now()){
 return {authorization:authorization?.trim()?'已记录授权依据，适用范围需按原记录核对':'授权记录缺失 · 待核',basis:basis?.trim()||'处理依据未知 · 待核',retention:until&&Number.isFinite(new Date(until).getTime())?(new Date(until).getTime()<=now?'已到期 · 不应继续访问':'保留期内'):'保留期限未知 · 待核'};
}
