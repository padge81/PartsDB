import test from 'node:test';
import assert from 'node:assert/strict';
import {activeModule,activeModuleLink,modules,moduleLinks} from '../lib/navigation.ts';
test('detail pages and existing bookmarks stay in their owning module',()=>{
 for(const path of ['/parts','/parts/search','/parts/new','/parts/123','/dashboard','/requests','/requests/123','/bom'])assert.equal(activeModule(path),'parts',path);
 for(const path of ['/machines','/machines/search','/machines/123'])assert.equal(activeModule(path),'machines',path);
 for(const path of ['/workshop','/workshop/logs','/workshop/references','/workshop/preview'])assert.equal(activeModule(path),'workshop',path);
 for(const path of ['/home','/admin','/admin/workshop','/admin/machines','/parts-other'])assert.equal(activeModule(path),null,path);
});
test('secondary navigation marks only its exact destination or supported alias',()=>{
 assert.equal(activeModuleLink('/dashboard','/parts/search'),true);
 assert.equal(activeModuleLink('/workshop/logs','/workshop'),false);
 assert.equal(activeModuleLink('/workshop/logs','/workshop/logs'),true);
 assert.equal(activeModuleLink('/requests/123','/requests'),true);
});
test('each module has an overview and every module action has a route',async()=>{
 const {existsSync}=await import('node:fs');
 for(const itemModule of modules){
  assert.equal(moduleLinks[itemModule.id][0].title,'Overview');
  assert.ok(existsSync('app'+itemModule.href+'/page.tsx'),itemModule.href);
  for(const item of moduleLinks[itemModule.id])assert.ok(existsSync('app'+item.href+'/page.tsx'),item.href);
 }
});

test('Parts opens search directly while Overview stays available separately',()=>{
 assert.equal(modules.find(item=>item.id==='parts').href,'/parts/search');
 assert.equal(moduleLinks.parts.find(item=>item.title==='Overview').href,'/parts/overview');
 assert.equal(activeModule('/parts/overview'),'parts');
 assert.equal(activeModuleLink('/parts/search','/parts/overview'),false);
});
