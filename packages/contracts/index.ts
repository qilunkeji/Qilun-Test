import { z } from 'zod';
const text = (max=200) => z.string().trim().min(1).max(max);
export const id = z.uuid();
export const loginInput = z.object({ tenant_id:id.optional(), username:text(100), password:z.string().min(1).max(256) }).strict();
export const jobInput = z.object({ title:text(), department:text(), owner:text(), location:text(), tasks:text(10000), criteria:text(10000), public_jd:text(20000), status:z.enum(['draft','pending','open','paused','closed','archived']), change_reason:text(1000) }).strict();
export const versionInput = jobInput.extend({expected_revision:z.number().int().positive()});
export const importInput = z.object({ candidate_id:id.optional(), name:text(), contact:z.string().trim().max(200).optional(), purpose:z.enum(['recruitment','talent_pool']), processing_basis:text(2000), retention_until:z.iso.datetime().refine(x=>Date.parse(x)>Date.now(),'保留日期必须晚于当前时间'), channel:text(100), external_id:text(200), authorization_ref:text(1000), filename:text(200).refine(x=>x.toLowerCase().endsWith('.txt'),'P1 仅支持 UTF-8 TXT 或粘贴文本'), text_content:z.string().min(1).max(200000).refine(x=>x.trim().length>0 && !x.includes('\u0000'),'文本无效').refine(x=>x.split('\n').length<=5000,'单份文本最多 5000 行，请拆分材料'), completeness:z.enum(['full','summary_only']) }).strict();
export const applicationInput = z.object({ candidate_id:id, job_id:id, job_version_id:id, resume_version_id:id, batch:text(100) }).strict();
export const listInput = z.object({ page:z.coerce.number().int().min(1).default(1), page_size:z.coerce.number().int().min(1).max(100).default(20), q:z.string().max(200).default('') });
