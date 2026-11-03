import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('company and machine editors provide complete add workflows',async()=>{
 const [company,machine]=await Promise.all([
  readFile(new URL('../components/company-editor.tsx',import.meta.url),'utf8'),
  readFile(new URL('../components/machine-manager.tsx',import.meta.url),'utf8'),
 ]);
 assert.match(company,/>Add Company</);
 assert.match(company,/from\("companies"\)\.insert/);
 assert.match(company,/ref=\{nameInput\}/);
 assert.match(company,/siteMode === "standby"/);
 assert.match(company,/const supplyType = "unknown"/);
 assert.match(company,/if \(wasCreating\) setCreating\(false\)/);
 assert.match(machine,/>Add Machine</);
 assert.match(machine,/from\("machines"\)\.insert/);
 assert.match(machine,/ref=\{nameInput\}/);
 assert.match(machine,/siteMode === "standby"/);
 assert.match(machine,/if \(wasCreating\) setCreating\(false\)/);
 assert.match(machine,/remove\(\[path\]\)/);
});
