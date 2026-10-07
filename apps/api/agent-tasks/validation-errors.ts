import {ZodError} from 'zod';
import {ServiceError} from '../http-error.ts';
const messages:Record<string,string>={UNVERIFIABLE_CITATION:'引用必须属于对应材料的连续原文',UNVERIFIABLE_INTERVIEW_CITATION:'面试引用来源或原文不匹配',RUBRIC_MISMATCH:'评价项必须与人工标准一一对应',SCORE_WITHOUT_EVIDENCE:'评分必须有面试文稿引用'};
// Never return parser input, submitted material, or arbitrary exception messages.
export function validationErrors(error:unknown){
 if(error instanceof ZodError)return error.issues.map(i=>({code:'INVALID_OUTPUT',message:'字段类型、范围或结构不符合任务要求',path:i.path}));
 if(error instanceof ServiceError)return [{code:error.code,message:error.message,path:[]}];
 const code=error instanceof Error&&Object.hasOwn(messages,error.message)?error.message:'AGENT_VALIDATION_FAILED';
 return [{code,message:messages[code]??'结果未通过校验',path:[]}];
}
