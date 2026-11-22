const { chromium } = await import(process.env.PW_CORE || '/tmp/pw/node_modules/playwright-core/index.mjs');
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const pg = await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://127.0.0.1:5191/?fresh=1'); await pg.waitForTimeout(1000);
const ok=(n,c,x='')=>console.log(c?'OK  ':'FAIL',n,x);
await pg.evaluate(()=>{const a=__app;const f=a.newFrame(0,0,16,16,false,'T');a.selectFrame(f);a.fitAll(false)});
await pg.waitForTimeout(300);
const scr=(x,y)=>pg.evaluate(([x,y])=>{const c=__app.cam,r=document.getElementById('ov').getBoundingClientRect();return {x:r.left+(x-c.x)*c.zoom+r.width/2,y:r.top+(y-c.y)*c.zoom+r.height/2}},[x,y]);
const grid=()=>pg.evaluate(()=>{const f=[...__app.doc.frames.values()].find(g=>g.name==='T');let o='';for(let y=0;y<16;y++){for(let x=0;x<16;x++){o+=f.px[(y*16+x)*4+3]?'#':'.'}o+='\n'}return o});
const click=async(x,y)=>{const p=await scr(x+.5,y+.5);await pg.mouse.move(p.x,p.y);await pg.mouse.down();await pg.mouse.up()};
// pincel redondo 5
await pg.keyboard.press('b'); await pg.evaluate(()=>{__app.S.brush=5;__app.S.opt.round=true;__app.S.opt.mirrorY=true;__app.S.opt.mirror=true;__app.ui.ctxSync()});
await click(4,3);
const g=await grid(); console.log(g);
const n=(g.match(/#/g)||[]).length; ok('redondo 5 = 21 px x4 espelhos = 84',n===84,String(n));
// balde em todo o quadro
await pg.keyboard.press('Control+z');
await pg.evaluate(()=>{__app.S.opt.mirror=false;__app.S.opt.mirrorY=false;__app.S.brush=1;__app.S.opt.fillAll=true;__app.ui.ctxSync()});
await pg.keyboard.press('g'); await click(0,0);
ok('balde global preenche tudo',((await grid()).match(/#/g)||[]).length===256);
await pg.keyboard.press('y'); await pg.screenshot({path:'/tmp/shots/v11-opts.png'});
await b.close(); console.log('erros:',errs);
