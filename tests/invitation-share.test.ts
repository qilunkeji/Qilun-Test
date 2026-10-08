import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';

test('邀请信息一次包含原答题链接和访问码，不额外生成报告链接',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
 try{
  const {InvitationShare,invitationShareText}=await server.ssrLoadModule('/src/invitation-share.tsx');
  const url='https://example.invalid/h5/#fictional-only',pin='123456',text=invitationShareText(url,pin);
  assert.ok(text.includes(`链接：${url}\n访问码：${pin}`));assert.match(text,/完成答题后将自动生成/);assert.doesNotMatch(text,/report#|[?&]pin=/);
  const html=renderToStaticMarkup(React.createElement(InvitationShare,{url,pin,onClose:()=>{}}));
  assert.match(html,/复制链接和访问码/);assert.match(html,/readonly=""/i);assert.match(html,/123456/);assert.doesNotMatch(html,/独立报告链接|建议单独发送/);
 }finally{await server.close();}
});

test('旧报告入口继续兼容，前台不再显示额外报告链接，不改鉴权和提交逻辑',async()=>{
 for(const file of ['h5.tsx','gh-h5-quiz.tsx']){
  const source=await readFile(new URL(`../apps/admin-web/src/${file}`,import.meta.url),'utf8');
  assert.match(source,/报告已自动生成/);assert.match(source,/原测评链接和访问码/);assert.doesNotMatch(source,/value=\{`\$\{location.origin\}\/h5\/report#/);
  assert.match(source,/data.submitted&&data.report/);assert.match(source,/JSON.stringify\(\{token,pin,/);assert.match(source,/'submit'/);
 }
 const center=await readFile(new URL('../apps/admin-web/src/assessment-center.tsx',import.meta.url),'utf8');
 assert.match(center,/<InvitationShare url=\{link.url\} pin=\{link.pin\}/);assert.doesNotMatch(center,/访问码建议单独发送|独立报告链接/);
});
