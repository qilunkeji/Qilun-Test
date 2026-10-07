import {canManageAssessment} from '../../../packages/security/assessment-access.ts';

export function settingsTabs(role:string):{id:string;label:string}[] {
 return [
  {id:'models',label:'模型与接入'},
  {id:'status',label:'系统状态'},
  ...(canManageAssessment(role)?[{id:'assessment-admin',label:'测评后台'}]:[]),
  ...(canManageAssessment(role)||role==='ops'?[{id:'audit',label:'操作审计'}]:[])
 ];
}
