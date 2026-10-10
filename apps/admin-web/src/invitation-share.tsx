import {useRef,useState} from 'react';

export function invitationShareText(url:string){
 return `齐论 AI 测评｜更了解自己，发现你的优势\n了解你的性格特点、工作偏好与优势，为成长和职业发展提供参考。\n点击开始：${url}\n请填写本人资料，按真实想法认真作答，建议预留约30分钟。\n完成后，即可查看你的个人测评报告。`;
}

export function InvitationShare({url,onClose,showClose=true}:{url:string;onClose:()=>void;showClose?:boolean}){
 const [message,setMessage]=useState(''),[copying,setCopying]=useState(false);
 const preview=useRef<HTMLTextAreaElement>(null),text=invitationShareText(url);
 async function copy(){
  if(copying)return;setCopying(true);setMessage('');
  try{await navigator.clipboard.writeText(text);setMessage('已复制邀请信息，可直接发送给参与者。');}
  catch{preview.current?.focus();preview.current?.select();setMessage('浏览器未允许自动复制，已选中邀请信息，请手动复制。');}
  finally{setCopying(false);}
 }
 return <section className="panel invitation-share"><h2>测评链接已创建</h2><p>复制下面的邀请信息，发送给参与者即可。</p><label className="field"><span>发给参与者的邀请</span><textarea ref={preview} readOnly rows={6} value={text}/></label><p className="muted">请及时保存链接。</p><div className="toolbar"><button className="primary" disabled={copying} onClick={()=>void copy()}>{copying?'正在复制…':'复制测评链接'}</button>{showClose&&<button onClick={onClose}>已记录，收起链接</button>}</div>{message&&<p role="status">{message}</p>}</section>;
}
