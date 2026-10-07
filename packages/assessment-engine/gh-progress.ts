import {z} from 'zod';
export const ghProgressSchema=z.object({phase:z.enum(['questions','groups','shortlist','rank']),page:z.number().int().min(0).max(92),group:z.number().int().min(0).max(3)}).strict();
export type GhProgress=z.infer<typeof ghProgressSchema>;
/** Display-only cursor. Never participates in the answer hash or scoring. */
export function resumeGhProgress(ids:string[],answers:Record<string,number>,values:{selected:string[][];ranked:string[]},saved?:GhProgress|null):GhProgress {
 const parsed=ghProgressSchema.safeParse(saved);
 if(parsed.success&&parsed.data.page<Math.ceil(ids.length/3))return parsed.data;
 const missing=ids.findIndex(id=>answers[id]===undefined),group=values.selected.findIndex(items=>items.length!==5);
 return {phase:missing>=0?'questions':group>=0?'groups':values.ranked.length<10?'shortlist':'rank',page:missing>=0?Math.floor(missing/3):Math.max(0,Math.ceil(ids.length/3)-1),group:Math.max(0,group)};
}
