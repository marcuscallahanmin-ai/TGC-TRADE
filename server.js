const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(ROOT, 'uploads');
const DATA_FILE = path.join(ROOT, 'data.json');
fs.mkdirSync(UPLOADS, { recursive: true });

const seed = [
  {id:'seed-1', name:'Charizard ex', set:'Obsidian Flames', price:4500, mode:'Both', condition:'Near Mint', location:'Manila', seller:'Marcus', photo:'', description:'Clean copy. Open to serious trade offers.', wants:'Umbreon, Eeveelutions', createdAt:Date.now()-400000},
  {id:'seed-2', name:'Umbreon VMAX', set:'Evolving Skies', price:9200, mode:'Trade', condition:'Near Mint', location:'Quezon City', seller:'Sarah', photo:'', description:'Looking for Charizard or vintage.', wants:'Charizard, vintage', createdAt:Date.now()-300000},
  {id:'seed-3', name:'Pikachu VMAX', set:'Vivid Voltage', price:1800, mode:'Sale', condition:'Lightly Played', location:'Makati', seller:'Ken', photo:'', description:'Great binder card.', wants:'', createdAt:Date.now()-200000},
  {id:'seed-4', name:'Mew ex', set:'151', price:1200, mode:'Both', condition:'Near Mint', location:'Taguig', seller:'Jessa', photo:'', description:'Trade preferred.', wants:'Pikachu, Eevee', createdAt:Date.now()-100000}
];
let db = load();
function load(){ try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); } catch { return {listings:seed, wants:[]}; } }
function save(){ try { fs.writeFileSync(DATA_FILE, JSON.stringify(db)); } catch(e) { console.error('Save failed:',e.message); } }
function id(){ return crypto.randomBytes(10).toString('hex'); }
function json(res,status,data){ const body=JSON.stringify(data); res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}); res.end(body); }
function readBody(req, max=200000){ return new Promise((resolve,reject)=>{let s=''; req.on('data',c=>{s+=c; if(s.length>max){req.destroy(); reject(new Error('BODY_TOO_LARGE'));}}); req.on('end',()=>resolve(s)); req.on('error',reject);}); }
function clean(v,max=1000){return String(v??'').trim().slice(0,max)}
function safeName(name){return clean(name,80).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'') || 'card'}
function mimeExt(type){return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[type] || null)}
function sendFile(res,file,type){fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'content-type':type,'cache-control':'no-cache'});res.end(b);});}
function contentType(file){const ext=path.extname(file).toLowerCase();return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}[ext]||'text/plain; charset=utf-8');}
function publicListing(x){return {...x, photo:x.photo||''};}

const server=http.createServer(async (req,res)=>{
  try {
    const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'content-type'});return res.end();}
    if(u.pathname==='/api/health') return json(res,200,{ok:true,service:'TGC TRADE',listings:db.listings.length});
    if(u.pathname==='/api/listings' && req.method==='GET') return json(res,200,{ok:true,listings:db.listings.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(publicListing)});
    if(u.pathname==='/api/listings' && req.method==='POST'){
      const raw=await readBody(req,12000000); const d=JSON.parse(raw||'{}');
      const name=clean(d.name,120); if(!name) return json(res,400,{ok:false,error:'CARD_NAME_REQUIRED'});
      const listing={id:id(),name,set:clean(d.set,120),price:Math.max(0,Number(d.price)||0),mode:['Sale','Trade','Both'].includes(d.mode)?d.mode:'Both',condition:clean(d.condition,60)||'Near Mint',location:clean(d.location,80),seller:clean(d.seller,80)||'Collector',description:clean(d.description,1200),wants:clean(d.wants,500),photo:'',createdAt:Date.now()};
      if(d.image && typeof d.image==='object' && typeof d.image.data==='string'){
        const ext=mimeExt(d.image.type); if(!ext) return json(res,400,{ok:false,error:'IMAGE_TYPE_NOT_SUPPORTED'});
        const buf=Buffer.from(d.image.data,'base64'); if(buf.length>5*1024*1024) return json(res,413,{ok:false,error:'IMAGE_TOO_LARGE'});
        const fn=`${listing.id}-${safeName(d.image.name||'card')}.${ext}`; fs.writeFileSync(path.join(UPLOADS,fn),buf); listing.photo=`/uploads/${fn}`;
      }
      db.listings.push(listing); save(); return json(res,201,{ok:true,listing:publicListing(listing)});
    }
    if(u.pathname.startsWith('/api/listings/') && req.method==='GET'){
      const item=db.listings.find(x=>x.id===u.pathname.split('/').pop()); return item?json(res,200,{ok:true,listing:publicListing(item)}):json(res,404,{ok:false,error:'NOT_FOUND'});
    }
    if(u.pathname==='/api/wants' && req.method==='GET') return json(res,200,{ok:true,wants:db.wants});
    if(u.pathname==='/api/wants' && req.method==='POST'){
      const raw=await readBody(req,10000); const d=JSON.parse(raw||'{}'); const want=clean(d.want,120); if(!want)return json(res,400,{ok:false,error:'WANT_REQUIRED'}); if(!db.wants.some(x=>x.toLowerCase()===want.toLowerCase()))db.wants.push(want); save(); return json(res,201,{ok:true,wants:db.wants});
    }
    if(u.pathname==='/api/wants' && req.method==='DELETE'){
      const raw=await readBody(req,10000); const d=JSON.parse(raw||'{}'); db.wants=db.wants.filter(x=>x!==d.want); save(); return json(res,200,{ok:true,wants:db.wants});
    }
    if(u.pathname.startsWith('/uploads/')){ const file=path.basename(u.pathname); const full=path.join(UPLOADS,file); if(!full.startsWith(UPLOADS+path.sep)) return json(res,400,{ok:false}); return sendFile(res,full,contentType(full)); }
    let filePath=u.pathname==='/'?path.join(PUBLIC,'index.html'):path.join(PUBLIC,u.pathname.replace(/^\//,'')); if(!filePath.startsWith(PUBLIC+path.sep)) return res.end('Not found');
    return sendFile(res,filePath,contentType(filePath));
  } catch(e){ console.error(e); return json(res,500,{ok:false,error:e.message||'SERVER_ERROR'}); }
});
server.listen(PORT,HOST,()=>console.log(`TGC TRADE running on ${HOST}:${PORT}`));
