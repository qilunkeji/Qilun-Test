// User-approved presentation changes, scoped to the referenced report regions.
// PDF/SVG evidence remains unchanged; both preview modes and print use this layer.
export function reportHeaderBranding(pageId:string){
 if(pageId==='data')return {
  logo:{x:60,y:60,width:122,height:88,src:'/brand/qilun-logo-light.png',alt:'齐论 AI'},
  hiddenQr:{x:1087,y:65,width:77,height:76},
 };
 if(/^talent-(0[1-9]|10)$/.test(pageId))return {
  logo:{x:60,y:pageId==='talent-01'?46:36,width:207,height:64,src:'/brand/qilun-logo-light.png',alt:'齐论 AI'},
  hiddenQr:undefined,
 };
 return undefined;
}

export const reportCoverBranding={
 artwork:{x:220,y:137,width:806,height:539},
 title:{x:100,y:692,width:1024,height:100,text:'齐论AI内部人才测评报告'},
};

export function reportFooterContactMask(pageId:string){
 if(pageId==='data')return {x:60,y:1537,width:305,height:25};
 if(pageId==='talent-01')return {x:60,y:1493,width:305,height:25};
 if(/^talent-(0[2-9]|10)$/.test(pageId))return {x:60,y:1483,width:305,height:25};
 return undefined;
}

export function reportFooterBranding(pageId:string){
 const contact=reportFooterContactMask(pageId);
 return contact?{x:975,y:contact.y,width:189,height:25,text:'齐论AI · 内部资料'}:undefined;
}

export function reportBodyBranding(pageId:string,recorded:boolean){
 if(pageId!=='talent-03')return [];
 return [{x:123,y:254,width:32,height:22,text:'齐论'},...(recorded?[{x:483,y:1368,width:32,height:22,text:'齐论'}]:[])];
}
