import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPartSearchIndex,searchParts} from '../lib/catalogue-search.ts';
const parts=[
{id:'a',description:'Bearing',manufacturer_part_number:'P10',supply_type:'local',manufacturer:{name:'SKF'}},
{id:'b',description:'Belt',manufacturer_part_number:'P2',supply_type:'dfl'},
{id:'c',description:'Bolt',manufacturer_part_number:null,supply_type:'local'},
];
const machines=[{id:'claw',name:'E-Claw',model:'2.0',manufacturer_id:'elaut',manufacturer:{name:'Elaut'}}];
const links=[{part_id:'a',machine_id:'claw'},{part_id:'b',machine_id:'claw'},{part_id:'c',machine_id:'missing'}];
const index=buildPartSearchIndex(parts,machines,links,[{part_id:'a',category_id:'bearings'}]);
const filters={query:'',machineId:'',manufacturerId:'',supplyType:'',categoryId:''};
const ids=(filter={},sort)=>searchParts(index,{...filters,...filter},sort).map(p=>p.id);
test('text finds numbers, part makers, machine names, models and machine makers',()=>{
 for(const query of [' E-CLAW ','2.0','Elaut']) assert.deepEqual(ids({query}),['a','b']);
 assert.deepEqual(ids({query:'skf'}),['a']);
 assert.deepEqual(ids({query:'P2'}),['b']);
});
test('combined filters intersect and unknown machines never return unrelated parts',()=>{
 assert.deepEqual(ids({machineId:'claw',manufacturerId:'elaut',supplyType:'local',categoryId:'bearings'}),['a']);
 assert.deepEqual(ids({machineId:'empty'}),[]);
 assert.deepEqual(ids({categoryId:'bearings',supplyType:'dfl'}),[]);
});
test('description and natural part-number sort do not mutate source or index',()=>{
 assert.deepEqual(ids({},'description-desc'),['c','b','a']);
 assert.deepEqual(ids({},'number'),['b','a','c']);
 assert.deepEqual(parts.map(p=>p.id),['a','b','c']);
 assert.deepEqual(ids(),['a','b','c']);
});
test('rebuilding index removes deleted compatibility',()=>{
 const changed=buildPartSearchIndex(parts,machines,[],[]);
 assert.equal(searchParts(changed,{...filters,machineId:'claw'}).length,0);
});
