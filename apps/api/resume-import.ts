import {randomUUID} from 'node:crypto';
import {importInput} from '../../packages/contracts/index.ts';
import {digest,encryptContact} from '../../packages/security/index.ts';
import {ServiceError} from './http-error.ts';
import type {Database} from './db.ts';
const conflict=(m:string)=>new ServiceError(409,'VERSION_CONFLICT',m);
const missing=()=>new ServiceError(404,'NOT_FOUND','对象不存在或已到期');
export async function importResume(db:Database,key:Buffer,a:{tenant_id:string;user_id:string},raw:unknown){
 const input=importInput.parse(raw),hash=digest(input.text_content),config={contactKey:key};
    const result=await db.transaction(async tx=>{
      // Stable source identity only; never match on name, school, inferred personality, or an unverified contact.
      const source=(await tx.query<{id:string;candidate_id:string}>('SELECT id,candidate_id FROM candidate_sources WHERE tenant_id=$1 AND channel=$2 AND external_id=$3',[a.tenant_id,input.channel,input.external_id])).rows[0];
      if(source&&input.candidate_id&&source.candidate_id!==input.candidate_id)throw conflict('此来源已绑定其他人员，需人工核验');
      const candidateId=source?.candidate_id??input.candidate_id??randomUUID();
      if(source||input.candidate_id){
        const c=(await tx.query<{id:string;name:string;purpose:string}>('SELECT id,name,purpose FROM candidates WHERE tenant_id=$1 AND id=$2 AND retention_until>now() FOR UPDATE',[a.tenant_id,candidateId])).rows[0];
        if(!c)throw missing();if(c.name!==input.name||c.purpose!==input.purpose)throw conflict('来源绑定的姓名或用途与主档不一致，请核验，不自动覆盖');
      }else await tx.query('INSERT INTO candidates(id,tenant_id,name,contact_cipher,purpose,processing_basis,retention_until,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[candidateId,a.tenant_id,input.name,input.contact?encryptContact(input.contact,config.contactKey,a.tenant_id):null,input.purpose,input.processing_basis,input.retention_until,a.user_id]);
      const sourceId=source?.id??randomUUID();
      if(!source) await tx.query('INSERT INTO candidate_sources(id,tenant_id,candidate_id,channel,external_id,authorization_ref) VALUES($1,$2,$3,$4,$5,$6)',[sourceId,a.tenant_id,candidateId,input.channel,input.external_id,input.authorization_ref]);
      const duplicate=(await tx.query<{id:string;version:number}>('SELECT id,version FROM resume_versions WHERE tenant_id=$1 AND source_id=$2 AND content_hash=$3',[a.tenant_id,sourceId,hash])).rows[0];
      if(duplicate)return {candidate_id:candidateId,resume_version_id:duplicate.id,version:duplicate.version,duplicate:true};
      const version=(await tx.query<{version:number}>('SELECT coalesce(max(version),0)::int+1 AS version FROM resume_versions WHERE tenant_id=$1 AND candidate_id=$2',[a.tenant_id,candidateId])).rows[0].version;
      const resumeId=randomUUID();
      await tx.query('INSERT INTO resume_versions(id,tenant_id,candidate_id,source_id,version,filename,content_hash,text_content,completeness,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[resumeId,a.tenant_id,candidateId,sourceId,version,input.filename,hash,input.text_content,input.completeness,a.user_id]);
      const lines=input.text_content.split(/\r?\n/);
      for(let n=0;n<lines.length;n++) await tx.query('INSERT INTO document_chunks(id,tenant_id,resume_version_id,line_number,text_content) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,resumeId,n+1,lines[n]]);
      await tx.query('INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.tenant_id,a.user_id,'resume.imported',resumeId]);
      return {candidate_id:candidateId,resume_version_id:resumeId,version,duplicate:false};
    });
 return result;
}
