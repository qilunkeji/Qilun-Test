import type {GhInvitePackage} from '../../../packages/assessment-engine/gh-invite.ts';

type Props={question:GhInvitePackage['questions'][number];choices:GhInvitePackage['choices'];value?:number;disabled:boolean;onSelect:(value:number)=>void};
/** Presentation only: the original order, labels and 1–5 codes are unchanged. */
export function GhAnswerQuestion({question:q,choices,value,disabled,onSelect}:Props){
 const paired=q.answer_type===5;
 const labels=paired?choices.paired:choices.single;
 return <fieldset disabled={disabled} className={'h5-compact-question'+(value!==undefined?' is-answered':'')}>
  <legend className="h5-question-title"><span aria-hidden="true">{String(q.order).padStart(2,'0')}</span>第 {q.order} 题{value!==undefined&&<small>已选择</small>}</legend>
  <div className={'h5-statements '+(paired?'h5-statements-paired':'h5-statements-single')}>
   {paired?<><p className={'h5-statement h5-statement-a'+(value!==undefined&&value<3?' is-preferred':'')}><b>A</b><span>{q.a}</span></p><p className={'h5-statement h5-statement-b'+(value!==undefined&&value>3?' is-preferred':'')}><b>B</b><span>{q.b}</span></p></>:<p className="h5-statement"><span>{q.title||q.a}</span></p>}
  </div>
  <div className="h5-dot-options">{labels.map((label,i)=><label key={label} className={value===i+1?'selected':''}>
   <input type="radio" name={q.id} aria-label={label} checked={value===i+1} onChange={()=>onSelect(i+1)}/>
   <span className="h5-choice-dot" aria-hidden="true">{i+1}</span>
   <small>{(paired?['很像A','较像A','差不多','较像B','很像B']:['完全符合','多数符合','一般符合','偶尔符合','完全不符'])[i]}</small>
  </label>)}</div>
 </fieldset>;
}
