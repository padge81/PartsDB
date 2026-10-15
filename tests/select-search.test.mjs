import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingOptions} from '../lib/select-search.ts';
const options=[{value:'',label:'All machines'},{value:'1',label:'E-Claw 2.0 Blue'},{value:'2',label:'E-Claw Red',disabled:true},{value:'3',label:'Air Hockey'}];
test('typing narrows by all words regardless of case',()=>assert.deepEqual(matchingOptions(options,'BLUE claw').map(o=>o.value),['','1']));
test('no-match search retains only the explicit clear option',()=>assert.deepEqual(matchingOptions(options,'absent').map(o=>o.value),['']));
test('clearing text restores every choice',()=>assert.deepEqual(matchingOptions(options,''),options));
test('disabled choices remain disabled after filtering',()=>assert.equal(matchingOptions(options,'red')[1].disabled,true));
