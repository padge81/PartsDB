import test from 'node:test';
import assert from 'node:assert/strict';
import {narrowOptions} from '../lib/select-search.ts';
const options=[{value:'',label:'All machines'},{value:'1',label:'E-Claw 2.0 Blue'},{value:'2',label:'E-Claw Red',disabled:true},{value:'3',label:'Air Hockey'}];
test('typing narrows by all words regardless of case',()=>{
 assert.deepEqual(narrowOptions(options,'BLUE claw','').visible.map(o=>o.value),['','1']);
});
test('filtering never silently replaces the current selection or removes the clear option',()=>{
 const result=narrowOptions(options,'hockey','1');
 assert.deepEqual(result.visible.map(o=>o.value),['','1','3']);assert.equal(result.selectionKept,true);assert.equal(result.matches,1);
});
test('no matches preserves selection and reports empty results; clearing restores all choices',()=>{
 const result=narrowOptions(options,'absent','1');assert.equal(result.matches,0);assert.deepEqual(result.visible.map(o=>o.value),['','1']);
 assert.deepEqual(narrowOptions(options,'','1').visible,options);
});
test('disabled choice metadata survives filtering',()=>{
 assert.equal(narrowOptions(options,'red','').visible[1].disabled,true);
});
