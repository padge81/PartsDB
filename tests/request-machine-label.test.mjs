import test from 'node:test';
import assert from 'node:assert/strict';
import {requestMachineLabel} from '../lib/request-machine-label.ts';
test('selected machine name is displayed when optional model is missing',()=>assert.equal(requestMachineLabel({machine_name:'E-Claw 2.0',machine_model:null}),'E-Claw 2.0'));
test('machine name takes precedence over its model',()=>assert.equal(requestMachineLabel({machine_name:'Air Hockey',machine_model:'AH-200'}),'Air Hockey'));
test('older model-only requests retain their machine label',()=>assert.equal(requestMachineLabel({machine_name:' ',machine_model:'AH-200'}),'AH-200'));
test('additional machine links do not display as no machine',()=>assert.equal(requestMachineLabel({machine_ids:['a','a','b']}),'2 compatible machines selected'));
test('empty request is the only case labelled no machine',()=>assert.equal(requestMachineLabel({machine_name:' ',machine_model:'',machine_ids:[]}),'No machine specified'));
