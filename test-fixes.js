'use strict';
const fs = require('fs');
global.window = {};
require('./asy-interp.js');
const A = window.AsyInterp;

const tests = [
  {
    name: 'array-after-name params: pair v[]',
    code: `[asy]
size(100);
void drawGraph(pair vertices[], pair edges[], real radius){
  for(pair edge: edges){
    pair start = vertices[(int) edge.x];
    pair end = vertices[(int) edge.y];
    draw(start--end);
  }
  for(pair vertex: vertices){
    filldraw(circle(vertex, radius), white);
  }
}
pair[] v = {(0,0), (1,0), (0.5,1)};
pair[] e = {(0,1), (1,2), (2,0)};
drawGraph(v, e, 0.1);
[/asy]`
  },
  {
    name: 'array param with default: pen color[]={white}',
    code: `[asy]
size(100);
void f(pen color[]={red}){
  draw((0,0)--(1,0), color[0]);
}
f();
[/asy]`
  },
  {
    name: 'multi-dim array int[][]',
    code: `[asy]
size(200,150);
int[][] values = {{7, 2, 1}, {4, 1, 5}};
for(int i = 0; i < 2; ++i) {
  for(int j = 0; j < 3; ++j) {
    label(string(values[i][j]), (j, -i));
  }
}
[/asy]`
  },
  {
    name: '# integer division',
    code: `[asy]
size(80);
for(int n=0; n<9; ++n) {
  int x = (n % 3) - 3;
  int y = -(n # 3);
  draw((x,y)--(x+1,y)--(x+1,y-1)--(x,y-1)--cycle);
}
[/asy]`
  },
  {
    name: 'recursion depth limit',
    code: `[asy]
size(100);
path scale(real s, pair D, pair E) {
  return scale(s)*D--scale(s)*E;
}
draw((0,0)--(1,1));
[/asy]`
  },
  {
    name: 'function-type param: void checker(int,int)=plainbox',
    code: `[asy]
size(100);
void plainbox(int i, int j) {
  draw((i,j)--(i+1,j)--(i+1,j+1)--(i,j+1)--cycle);
}
void drawboard(int x, int y, void checker(int,int)=plainbox) {
  for(int i=0; i<x; ++i) {
    for(int j=0; j<y; ++j) {
      checker(i,j);
    }
  }
}
drawboard(3,3);
[/asy]`
  },
  {
    name: 'pen[][] multi-dim',
    code: `[asy]
size(100);
pen[][] colors = {{red,blue},{green,yellow}};
for(int i=0; i<=1; ++i) {
  for(int j=0; j<=1; ++j) {
    fill((i,j)--(i+1,j)--(i+1,j+1)--(i,j+1)--cycle, colors[i][j]);
  }
}
[/asy]`
  },
  {
    name: 'string[][] param',
    code: `[asy]
size(100);
void drawgrid(int n, string[][] S){
  for(int i=0; i<S.length; ++i) {
    for(int j=0; j<S[i].length; ++j) {
      label(S[i][j], (j,-i));
    }
  }
}
string[][] data = {{"A","B"},{"C","D"}};
drawgrid(2, data);
[/asy]`
  },
];

for (const t of tests) {
  try {
    A.render(t.code, { containerW: 500, containerH: 400 });
    console.log('PASS:', t.name);
  } catch (e) {
    console.log('FAIL:', t.name, '-', e.message.split('\\n')[0].substring(0, 120));
  }
}
