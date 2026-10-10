import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
test('分享只有共用测评链接，没有访问码或个人答卷链接',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
 try{
  const {InvitationShare,invitationShareText}=await server.ssrLoadModule('/src/invitation-share.tsx');
  const url='https://example.invalid/h5/join#fictional-only',text=invitationShareText(url);
  assert.ok(text.includes(`链接：${url}`));assert.match(text,/每人填写本人姓名/);assert.doesNotMatch(text,/访问码：|report#|请仅本人使用|不要转发/);
  const html=renderToStaticMarkup(React.createElement(InvitationShare,{url,onClose:()=>{}}));assert.match(html,/复制测评链接/);assert.match(html,/readonly=""/i);assert.doesNotMatch(html,/链接与访问码|独立报告链接/);
 }finally{await server.close();}
});
test('所有H5路径统一登记，测评中心与招聘创建不预先绑定人员',async()=>{
 const read=(file:string)=>readFile(new URL(`../apps/admin-web/src/${file}`,import.meta.url),'utf8');
 const main=await read('main.tsx');assert.match(main,/location.pathname.startsWith\('\/h5'\)\?<PublicEntryH5\/>/);
 const center=await read('assessment-center.tsx');assert.match(center,/<PublicEntryManager/);assert.doesNotMatch(center,/创建专属链接|指定人员|邀请方式/);
 const application=await read('application-assessment.tsx');assert.doesNotMatch(application,/candidate_id:|application_id:|pin=\{/);
 const quiz=await read('gh-h5-quiz.tsx');assert.match(quiz,/报告已自动生成/);assert.doesNotMatch(quiz,/原测评链接和访问码/);
});
