import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseDirectionalTarget} from '../js/ui/remote.js';

const rect = (x,y) => ({x,y,width:20,height:20});
test('directional navigation excludes targets behind the current focus', () => {
  const left = {rect:rect(-30,0)}, right = {rect:rect(100,0)};
  assert.equal(chooseDirectionalTarget(rect(0,0), [left,right], 'ArrowRight'), right);
  assert.equal(chooseDirectionalTarget(rect(0,0), [left,right], 'ArrowLeft'), left);
});
test('navigation preserves the existing alignment-weighted scoring', () => {
  const diagonal = {rect:rect(30,100)}, aligned = {rect:rect(100,0)};
  assert.equal(chooseDirectionalTarget(rect(0,0), [diagonal,aligned], 'ArrowRight'), aligned);
});
test('top and bottom navigation use the same scoring and keep focus at boundaries', () => {
  const above = {rect:rect(0,-30)}, below = {rect:rect(0,30)};
  assert.equal(chooseDirectionalTarget(rect(0,0), [above,below], 'ArrowUp'), above);
  assert.equal(chooseDirectionalTarget(rect(0,0), [above,below], 'ArrowDown'), below);
  assert.equal(chooseDirectionalTarget(rect(0,0), [above], 'ArrowDown'), null);
  assert.equal(chooseDirectionalTarget(rect(0,0), [above], 'Enter'), null);
});
