const { chromium } = await import(process.env.PW_CORE || '/tmp/pw/node_modules/playwright-core/index.mjs');
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const pg = await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://127.0.0.1:5191/?fresh=1'); await pg.waitForTimeout(1000);
const ok=(n,c,x='')=>console.log(c?'OK  ':'FAIL',n,x);
await pg.evaluate(()=>{const a=__app;const f=a.newFrame(0,0,16,16,false,'T');a.selectFrame(f);a.fitAll(false);
  const buf=a.doc.activeBuf(f); // bloco 4x4 vermelho em (2,2) com ponto azul no canto sup. esq.
  for(let y=2;y<6;y++)for(let x=2;x<6;x++){buf.set([255,0,0,255],(y*16+x)*4)}
  buf.set([0,0,255,255],(2*16+2)*4); a.doc.composite(f,0,0,16,16); a.R.upload(a.doc,f)});
await pg.waitForTimeout(400);
const scr=(x,y)=>pg.evaluate(([x,y])=>{const c=__app.cam,r=document.getElementById('ov').getBoundingClientRect();return {x:r.left+(x-c.x)*c.zoom+r.width/2,y:r.top+(y-c.y)*c.zoom+r.height/2}},[x,y]);
const px=(x,y)=>pg.evaluate(([x,y])=>{const f=[...__app.doc.frames.values()].find(g=>g.name==='T');const o=(y*f.w+x)*4;return [...f.px.slice(o,o+4)]},[x,y]);
const count=()=>pg.evaluate(()=>{const f=[...__app.doc.frames.values()].find(g=>g.name==='T');let n=0;for(let i=3;i<f.px.length;i+=4)if(f.px[i])n++;return n});
const ps=()=>pg.evaluate(()=>{const p=__app.psel;return p&&{x:p.x,y:p.y,w:p.w,h:p.h}});
await pg.keyboard.press('m');
let a=await scr(2,2),c=await scr(6,6);
await pg.mouse.move(a.x+2,a.y+2); await pg.mouse.down(); await pg.mouse.move(c.x-2,c.y-2,{steps:4}); await pg.mouse.up();
let s=await ps(); ok('seleção 4x4',JSON.stringify(s)==='{"x":2,"y":2,"w":4,"h":4}',JSON.stringify(s));
// esticar alça SE de (6,6) para (10,10)
let h=await scr(6,6), t=await scr(10,10);
await pg.mouse.move(h.x,h.y); await pg.mouse.down(); await pg.mouse.move(t.x,t.y,{steps:6}); await pg.screenshot({path:'/tmp/shots/v11-scale.png'}); await pg.mouse.up();
s=await ps(); ok('esticou para 8x8',JSON.stringify(s)==='{"x":2,"y":2,"w":8,"h":8}',JSON.stringify(s));
ok('pixels: 64 preenchidos',(await count())===64,String(await count()));
ok('ponto azul no canto',(await px(2,2)).join()==='0,0,255,255' && (await px(3,3)).join()==='0,0,255,255' && (await px(4,4)).join()==='255,0,0,255');
await pg.keyboard.press('Control+z'); ok('undo volta 4x4',(await count())===16 && (await px(5,5))[3]===255 && (await px(6,6))[3]===0,String(await count()));
await pg.keyboard.press('Control+Shift+z'); ok('redo 8x8',(await count())===64);
await pg.keyboard.press('Control+z');
// amassar: seleciona 4x4 de novo, alça E de x=6 para x=4 e alça S de y=6 para y=5 -> 2x3
await pg.keyboard.press('m');
a=await scr(2,2); c=await scr(6,6);
await pg.mouse.move(a.x+2,a.y+2); await pg.mouse.down(); await pg.mouse.move(c.x-2,c.y-2,{steps:4}); await pg.mouse.up();
h=await scr(6,4); t=await scr(4,4);
await pg.mouse.move(h.x,h.y); await pg.mouse.down(); await pg.mouse.move(t.x,t.y,{steps:5}); await pg.mouse.up();
s=await ps(); ok('amassou largura para 2',JSON.stringify(s)==='{"x":2,"y":2,"w":2,"h":4}',JSON.stringify(s));
ok('16 -> 8 pixels',(await count())===8,String(await count()));
h=await scr(3,6); t=await scr(3,2.0001);
// passar da borda oposta espelha: puxa alça S para cima de y=2 (y=1) 
t=await scr(3,1);
await pg.mouse.move(h.x,h.y); await pg.mouse.down(); await pg.mouse.move(t.x,t.y,{steps:5}); await pg.mouse.up();
s=await ps(); console.log('após inverter',JSON.stringify(s), await px(2,2), await px(2,1));
await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+z');
// espelhar e girar
await pg.keyboard.press('m'); a=await scr(2,2); c=await scr(6,6);
await pg.mouse.move(a.x+2,a.y+2); await pg.mouse.down(); await pg.mouse.move(c.x-2,c.y-2,{steps:4}); await pg.mouse.up();
await pg.keyboard.press('Shift+H'); ok('espelhou H: azul foi para a direita',(await px(5,2)).join()==='0,0,255,255' && (await px(2,2)).join()==='255,0,0,255');
await pg.keyboard.press('Shift+V'); ok('espelhou V: azul foi para baixo',(await px(5,5)).join()==='0,0,255,255');
await pg.keyboard.press('Shift+R'); s=await ps(); ok('girou 90 (mantém 4x4)',s.w===4&&s.h===4, JSON.stringify(s)+' azul(5,5)->'+(await px(2,5)).join());
await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowDown'); s=await ps(); ok('setas movem a seleção',s.x===3&&s.y===3,JSON.stringify(s));
ok('16 pixels depois de tudo',(await count())===16,String(await count()));
// Alt+arrastar cria cópia
let m=await scr(4.5,4.5), m2=await scr(11.5,4.5);
await pg.keyboard.down('Alt'); await pg.mouse.move(m.x,m.y); await pg.mouse.down(); await pg.mouse.move(m2.x,m2.y,{steps:5}); await pg.mouse.up(); await pg.keyboard.up('Alt');
ok('Alt+arrastar duplica (32 pixels)',(await count())===32,String(await count()));
await pg.keyboard.press('Control+a'); s=await ps(); ok('Ctrl+A seleciona o quadro',s.w===16&&s.h===16);
await pg.screenshot({path:'/tmp/shots/v11-all.png'});
await pg.keyboard.press('Control+d'); ok('Ctrl+D desmarca',(await ps())===null);
await b.close(); console.log('erros:',errs);
