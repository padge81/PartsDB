import test from 'node:test';
import assert from 'node:assert/strict';
import {activeModule,activeModuleLink,modules,moduleLinks} from '../lib/navigation.ts';
test('detail pages and existing bookmarks stay in their owning module',()=>{
 for(const path of ['/parts','/parts/search','/parts/new','/parts/123','/dashboard','/requests','/requests/123','/bom'])assert.equal(activeModule(path),'parts',path);
 for(const path of ['/machines','/machines/search','/machines/123'])assert.equal(activeModule(path),'machines',path);
 for(const path of ['/workshop','/workshop/logs','/workshop/references','/workshop/preview'])assert.equal(activeModule(path),'workshop',path);
 for(const path of ['/calculators','/calculators/circumference'])assert.equal(activeModule(path),'calculators',path);
 for(const path of ['/home','/admin','/admin/workshop','/admin/machines','/parts-other'])assert.equal(activeModule(path),null,path);
});
test('secondary navigation marks only its exact destination or supported alias',()=>{
 assert.equal(activeModuleLink('/dashboard','/parts/search'),true);
 assert.equal(activeModuleLink('/workshop/logs','/workshop'),false);
 assert.equal(activeModuleLink('/workshop/logs','/workshop/logs'),true);
 assert.equal(activeModuleLink('/requests/123','/requests'),true);
});
test('every module entry and action has a route',async()=>{
 const {existsSync}=await import('node:fs');
 for(const itemModule of modules){
  assert.ok(existsSync('app'+itemModule.href+'/page.tsx'),itemModule.href);
  for(const item of moduleLinks[itemModule.id])assert.ok(existsSync('app'+item.href+'/page.tsx'),item.href);
 }
});

test('Parts opens search directly and has no Overview option',()=>{
 assert.equal(modules.find(item=>item.id==='parts').href,'/parts/search');
 assert.equal(moduleLinks.parts.some(item=>item.title==='Overview'||item.href==='/parts/overview'),false);
 assert.equal(moduleLinks.parts[0].href,'/parts/search');
 assert.equal(activeModule('/parts/overview'),'parts');
 assert.equal(activeModuleLink('/parts/search','/parts/overview'),false);
});

test('Machines opens search directly and has no Overview option',()=>{
 assert.equal(modules.find(item=>item.id==='machines').href,'/machines/search');
 assert.equal(moduleLinks.machines.some(item=>item.title==='Overview'),false);
 assert.equal(moduleLinks.machines[0].href,'/machines/search');
 assert.equal(activeModule('/machines/search'),'machines');
});
