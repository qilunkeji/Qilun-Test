import {useState} from 'react';
import {api} from './api.ts';
import {InvitationShare} from './invitation-share.tsx';
export function ApplicationAssessment(_context:{candidateId:string;applicationId:string}){
 const [link,setLink]=useState<{url:string}>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <><button disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{setLink(await api('/assessment/invites',{purpose:'本岗位申请的自我了解与发展沟通',days:7,package_kind:'gh_reference_277'}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'创建中…':'发起测评'}</button>{error&&<p role="alert">{error}</p>}{link&&<InvitationShare url={link.url} onClose={()=>setLink(undefined)}/>}</>;
}
