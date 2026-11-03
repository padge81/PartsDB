import test from 'node:test';
import assert from 'node:assert/strict';
import {hasUnknownSupplyType, portableSupplyTypes} from '../lib/supply-type-default.ts';

test('a renamed active built-in default remains valid',()=>{
 assert.ok(hasUnknownSupplyType([{code:'unknown',name:'Not yet known',is_active:true}]));
 assert.ok(!hasUnknownSupplyType([{code:'other',name:'Unknown',is_active:true}]));
 assert.ok(!hasUnknownSupplyType([{code:'unknown',is_active:false}]));
 assert.ok(!hasUnknownSupplyType([]));
});
test('old backups map Unknown to the receiving ID and reactivate it',()=>{
 const rows=[{id:'source-default',code:'unknown',name:'Not known',is_active:false},{id:'custom',code:'local',name:'Local',is_active:true}];
 assert.deepEqual(portableSupplyTypes(rows,'destination-default'),[{...rows[0],id:'destination-default',is_active:true},rows[1]]);
 assert.equal(rows[0].is_active,false);
 assert.deepEqual(portableSupplyTypes([],'destination-default'),[]);
});
test('conflicting backup IDs fail before destructive restore begins',()=>{
 assert.throws(()=>portableSupplyTypes([{id:'destination-default',code:'custom'}],'destination-default'),/No data was cleared/);
});
