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
 for(const module of modules){
  assert.equal(moduleLinks[module.id][0].href,module.href);
  for(const item of moduleLinks[module.id])assert.ok(existsSync('app'+item.href+'/page.tsx'),item.href);
 }
});
