import test from 'node:test';
import assert from 'node:assert/strict';
import {drawRepairArrow} from '../lib/repair-annotations.ts';

function context(){
  let path=[];const strokes=[],fills=[];
  return {strokes,fills,lineWidth:4,beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},stroke(){strokes.push([...path]);},closePath(){},fill(){fills.push([...path]);}};
}
for(const [name,x,y,x2,y2] of [['horizontal',20,40,180,40],['reverse',180,40,20,40],['vertical',60,20,60,200],['diagonal',180,200,20,40]]){
  test('measurement arrow has outward-facing heads at both endpoints: '+name,()=>{
    const ctx=context();drawRepairArrow(ctx,x,y,x2,y2,true);
    assert.deepEqual(ctx.strokes,[[[x,y],[x2,y2]]]);assert.equal(ctx.fills.length,2);
    assert.deepEqual(ctx.fills[0][0],[x2,y2]);assert.deepEqual(ctx.fills[1][0],[x,y]);
    const dx=x2-x,dy=y2-y;
    for(const point of ctx.fills[0].slice(1))assert.ok((point[0]-x2)*dx+(point[1]-y2)*dy<0);
    for(const point of ctx.fills[1].slice(1))assert.ok((point[0]-x)*dx+(point[1]-y)*dy>0);
  });
}
test('ordinary arrows retain one arrowhead',()=>{
  const ctx=context();drawRepairArrow(ctx,20,40,180,40,false);
  assert.equal(ctx.fills.length,1);assert.deepEqual(ctx.fills[0][0],[180,40]);
});
