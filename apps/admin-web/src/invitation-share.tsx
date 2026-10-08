import {useRef,useState} from 'react';

export function invitationShareText(url:string,pin:string){
 return `邀请你参加齐论性格与发展测评\n链接：${url}\n访问码：${pin}\n完成答题后将自动生成测评报告，可通过原链接再次查看。请仅本人使用，不要转发。`;
}

export function InvitationShare({url,pin,onClose}:{url:string;pin:string;onClose:()=>void}){
 const [message,setMessage]=useState(''),[copying,setCopying]=useState(false);
 const preview=useRef<HTMLTextAreaElement>(null),text=invitationShareText(url,pin);
 async function copy(){
  if(copying)return;setCopying(true);setMessage('');
  try{await navigator.clipboard.writeText(text);setMessage('已复制链接和访问码，可以直接发给对方。');}
  catch{preview.current?.focus();preview.current?.select();setMessage('浏览器未允许自动复制，已选中邀请信息，请手动复制。');}
  finally{setCopying(false);}
 }
 return <section className="panel invitation-share"><h2>邀请已创建</h2><p>一键复制邀请信息，私发给参与者即可。完成后报告自动生成，后台也可查看。</p><label className="field"><span>邀请信息 · 链接与访问码</span><textarea ref={preview} readOnly rows={6} value={text}/></label><p className="muted">凭据仅在本次创建后显示，请及时保存。遗失时请撤销并重新邀请。</p><div className="toolbar"><button className="primary" disabled={copying} onClick={()=>void copy()}>{copying?'正在复制…':'复制链接和访问码'}</button><button onClick={onClose}>已记录，收起凭据</button></div>{message&&<p role="status">{message}</p>}</section>;
}
