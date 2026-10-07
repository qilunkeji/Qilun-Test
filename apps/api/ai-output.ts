import {z} from 'zod';
export const aiOutput=z.object({findings:z.array(z.object({kind:z.enum(['observation','suggestion']),text:z.string().min(1).max(1500),citations:z.array(z.object({id:z.string(),quote:z.string().min(3).max(500)}).strict()).min(1).max(6)}).strict()).max(12),unknowns:z.array(z.string().max(1000)).max(12)}).strict();
export function validateAIOutput(raw:unknown,evidence:{id:string;text:string}[]){
 const result=aiOutput.parse(raw);
 for(const f of result.findings)for(const c of f.citations)if(!evidence.some(e=>e.id===c.id&&e.text.includes(c.quote)))throw new Error('UNVERIFIABLE_CITATION');
 return result;
}
