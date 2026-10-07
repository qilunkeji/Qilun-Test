export const ghDraftVersion='qilun-gh-quiz-draft/v22';
export type GhQuizDraft={version:typeof ghDraftVersion;layout:'captured_32_words_v3';answers:Record<string,number>;selected:string[][];ranked:string[];page:number;step:number;group:number};
/** Local, resumable draft only. A partial draft is never a scoring request. */
export function restoreGhQuizDraft(raw:unknown,questionIds:string[],groups:string[][]):GhQuizDraft{
 const fail=()=>{throw new Error('草稿格式或题库版本不匹配，请使用本版本导出的草稿。');};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail();
 const r=raw as Record<string,unknown>,keys=['version','layout','answers','selected','ranked','page','step','group'];
 if(Object.keys(r).some(k=>!keys.includes(k))||keys.some(k=>!(k in r))||r.version!==ghDraftVersion||r.layout!=='captured_32_words_v3')return fail();
 if(!r.answers||typeof r.answers!=='object'||Array.isArray(r.answers))return fail();
 const answers=r.answers as Record<string,number>;
 if(Object.entries(answers).some(([id,v])=>!questionIds.includes(id)||!Number.isInteger(v)||v<1||v>5))return fail();
 if(!Array.isArray(r.selected)||r.selected.length!==4||r.selected.some((g,i)=>!Array.isArray(g)||g.length>5||new Set(g).size!==g.length||g.some(id=>typeof id!=='string'||!groups[i]?.includes(id))))return fail();
 const selected=r.selected as string[][];
 if(!Array.isArray(r.ranked)||r.ranked.length>10||new Set(r.ranked).size!==r.ranked.length||r.ranked.some(id=>typeof id!=='string'||!selected.flat().includes(id)))return fail();
 for(const [key,max] of [['page',Math.ceil(questionIds.length/4)-1],['step',3],['group',3]] as const)if(!Number.isInteger(r[key])||(r[key] as number)<0||(r[key] as number)>max)return fail();
 if((r.step as number)>=2&&!selected.every(g=>g.length===5)||(r.step===3&&(r.ranked as string[]).length!==10))return fail();
 return {version:ghDraftVersion,layout:'captured_32_words_v3',answers:{...answers},selected:selected.map(g=>[...g]),ranked:[...r.ranked] as string[],page:r.page as number,step:r.step as number,group:r.group as number};
}
