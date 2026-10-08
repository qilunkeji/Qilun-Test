export type ReportMetadata={participant_name?:string|null;phone:string|null;birth_date:string|null;active_seconds:number|null;profile_completed:boolean;consistency:{status:string;label:string;reason?:string}};
export function ReportHeader({name,date,metadata,width,height}:{name?:string;date?:string|null;metadata?:ReportMetadata;width:number;height:number}){
 const submitted=date?new Date(date):null,day=submitted&&Number.isFinite(submitted.getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(submitted).replaceAll('/','-'):'未记录';
 const seconds=metadata?.active_seconds,duration=seconds===null||seconds===undefined?'未记录':`${Math.floor(seconds/60)}分${seconds%60}秒`;
 return <svg className="original-computed-plots report-header-overlay" viewBox={`0 0 ${width} ${height}`} aria-label="测评基本信息"><rect x="195" y="52" width="930" height="100" fill="white"/><g fontFamily={'"PingFang SC","Microsoft YaHei",Arial,sans-serif'} fontSize="15" fill="#666">
 <text x="210" y="85">姓名：</text><text x="268" y="85" fill="#333" fontSize="14">{(metadata?.participant_name??name??'未记录').slice(0,16)}</text>
 <text x="505" y="85">手机号码：</text><text x="587" y="85" fill="#333" fontSize="14">{metadata?.phone??'未填写'}</text>
 <text x="840" y="85">出生日期：</text><text x="920" y="85" fill="#333" fontSize="14">{metadata?.birth_date??'未填写'}</text>
 <text x="210" y="130">测评时间：</text><text x="295" y="130" fill="#333" fontSize="14">{day}</text>
 <text x="505" y="130">答题用时：</text><text x="587" y="130" fill="#333" fontSize="14">{duration}</text>
 <text x="840" y="130">逻辑一致性：</text><text x="935" y="130" fill="#666" fontSize="14">未评定</text>
 </g></svg>;
}
