import {useRef,useState} from 'react';

export function invitationShareText(url:string){
 return `邀请你参加齐论性格与发展测评\n链接：${url}\n无需密码或访问码。每人填写本人姓名和资料后开始，答案及报告分别保存。\n一个人或多人均可使用此链接。完成后，在同一浏览器打开原链接可继续或查看自己的报告。`;
}

export function InvitationShare({url,onClose,showClose=true}:{url:string;onClose:()=>void;showClose?:boolean}){
 const [message,setMessage]=useState(''),[copying,setCopying]=useState(false);
 const preview=useRef<HTMLTextAreaElement>(null),text=invitationShareText(url);
 async function copy(){
  if(copying)return;setCopying(true);setMessage('');
  try{await navigator.clipboard.writeText(text);setMessage('已复制测评链接，可以发给一个人或多人。');}
  catch{preview.current?.focus();preview.current?.select();setMessage('浏览器未允许自动复制，已选中邀请信息，请手动复制。');}
  finally{setCopying(false);}
 }
 return <section className="panel invitation-share"><h2>测评链接已创建</h2><p>发给一个人或多人均可。每个人独立登记、答题和生成报告；需要关联人才档案时，在后台核对后操作。</p><label className="field"><span>邀请信息</span><textarea ref={preview} readOnly rows={6} value={text}/></label><p className="muted">请及时保存链接。</p><div className="toolbar"><button className="primary" disabled={copying} onClick={()=>void copy()}>{copying?'正在复制…':'复制测评链接'}</button>{showClose&&<button onClick={onClose}>已记录，收起链接</button>}</div>{message&&<p role="status">{message}</p>}</section>;
}
