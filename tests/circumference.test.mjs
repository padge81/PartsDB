import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCircle,convertMeasurement,formatMeasurement} from '../lib/circumference.ts';

test('radius calculates diameter and circumference',()=>{
 const result=calculateCircle('radius',10);
 assert.equal(result.radius,10);
 assert.equal(result.diameter,20);
 assert.ok(Math.abs(result.circumference-20*Math.PI)<1e-12);
});

test('diameter and circumference calculate the same circle',()=>{
 assert.ok(Math.abs(calculateCircle('diameter',20).radius-10)<1e-12);
 assert.ok(Math.abs(calculateCircle('circumference',20*Math.PI).radius-10)<1e-12);
});

test('measurement units convert without changing physical size',()=>{
 assert.equal(convertMeasurement(25.4,'mm','in'),1);
 assert.equal(convertMeasurement(1,'m','cm'),100);
});

test('invalid measurements are rejected',()=>{
 assert.throws(()=>calculateCircle('radius',0),/greater than zero/);
 assert.throws(()=>calculateCircle('diameter',-1),/greater than zero/);
});

test('display formatting keeps three useful decimal places',()=>{
 assert.equal(formatMeasurement(Math.PI),'3.142');
 assert.equal(formatMeasurement(10),'10');
});


test('diameter is shown as an external dimension',async()=>{
 const {readFile}=await import('node:fs/promises');
 const [component,css]=await Promise.all([
  readFile(new URL('../components/circumference-calculator.tsx',import.meta.url),'utf8'),
  readFile(new URL('../app/globals.css',import.meta.url),'utf8'),
 ]);
 assert.match(component,/diameter-extension left/);
 assert.match(component,/diameter-extension right/);
 assert.match(component,/diameter-dimension/);
 assert.doesNotMatch(component,/diameter-line/);
 assert.match(css,/\.diameter-dimension/);
});
