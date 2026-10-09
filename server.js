const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const PORT = Number(process.env.PORT || 10000), HOST = '0.0.0.0';
const ROOT = __dirname, PUBLIC = path.join(ROOT,'public'), UPLOADS = path.join(ROOT,'uploads'), DATA_FILE = path.join(ROOT,'data.json');
const SESSION_MS = 7*24*60*60*1000;
fs.mkdirSync(UPLOADS,{recursive:true});
const seed=[
{id:'seed-1',name:'Charizard ex',set:'Obsidian Flames',price:4500,mode:'Both',condition:'Near Mint',location:'Manila',seller:'Marcus',photo:'',description:'Clean copy. Open to serious trade offers.',wants:'Umbreon, Eeveelutions',createdAt:Date.now()-400000},
{id:'seed-2',name:'Umbreon VMAX',set:'Evolving Skies',price:9200,mode:'Trade',condition:'Near Mint',location:'Quezon City',seller:'Sarah',photo:'',description:'Looking for Charizard or vintage.',wants:'Charizard, vintage',createdAt:Date.now()-300000},
{id:'seed-3',name:'Pikachu VMAX',set:'Vivid Voltage',price:1800,mode:'Sale',condition:'Lightly Played',location:'Makati',seller:'Ken',photo:'',description:'Great binder card.',wants:'',createdAt:Date.now()-200000},
{id:'seed-4',name:'Mew ex',set:'151',price:1200,mode:'Both',condition:'Near Mint',location:'Taguig',seller:'Jessa',photo:'',description:'Trade preferred.',wants:'Pikachu, Eevee',createdAt:Date.now()-100000}];
function load(){try{const d=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));return {listings:Array.isArray(d.listings)?d.listings:seed,wants:Array.isArray(d.wants)?d.wants:[],users:Array.isArray(d.users)?d.users:[],sessions:Array.isArray(d.sessions)?d.sessions:[]}}catch{return {listings:seed,wants:[],users:[],sessions:[]}}}
let db=load();
function save(){const t=DATA_FILE+'.tmp';fs.writeFileSync(t,JSON.stringify(db),{mode:0o600});fs.renameSync(t,DATA_FILE)}
function id(n=24){return crypto.randomBytes(n).toString('hex')}
function clean(v,n=1000){return String(v??'').trim().slice(0,n)}
function mimeExt(t){return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'}[t]||null)}
function json(res,status,data,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(JSON.stringify(data))}
function readBody(req,max=200000){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>max){reject(Object.assign(new Error(),{status:413}));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch{reject(Object.assign(new Error(),{status:400}))}});req.on('error',reject)})}
function cookie(req,name){const x=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='));return x?decodeURIComponent(x.slice(name.length+1)):''}
function secure(req){return req.headers['x-forwarded-proto']==='https'||!!req.socket.encrypted}
function cookieHeader(req,v,age){return 'tgc_session='+encodeURIComponent(v)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(secure(req)?'; Secure':'')}
function sessionFor(req){const token=cookie(req,'tgc_session');if(!token)return null;const h=crypto.createHash('sha256').update(token).digest('hex');const s=db.sessions.find(x=>x.tokenHash===h&&x.expiresAt>Date.now());return s?db.users.find(u=>u.id===s.userId)||null:null}
function publicUser(u){return {id:u.id,name:u.name,location:u.location,createdAt:u.createdAt}}
function requireUser(req,res){const u=sessionFor(req);if(!u)json(res,401,{ok:false,error:'LOGIN_REQUIRED'});return u}
function sameOrigin(req){if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===(req.headers['x-forwarded-host']||req.headers.host)}catch{return false}}
function sendFile(res,file,type){fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'content-type':type,'cache-control':'no-cache','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'"});res.end(b)})}
function contentType(f){return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}[path.extname(f).toLowerCase()]||'application/octet-stream')}
function listingView(x){const {ownerId,...v}=x;return {...v,photo:x.photo||''}}
const attempts=new Map();
function limited(k){const now=Date.now(),a=(attempts.get(k)||[]).filter(t=>now-t<600000);if(a.length>=10)return true;a.push(now);attempts.set(k,a);return false}
async function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:(await scrypt(password,salt,64)).toString('hex')}}
function createSession(req,res,user){const token=id(32);db.sessions=db.sessions.filter(s=>s.expiresAt>Date.now()&&s.userId!==user.id);db.sessions.push({userId:user.id,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:Date.now()+SESSION_MS});save();res.setHeader('Set-Cookie',cookieHeader(req,token,SESSION_MS/1000))}
const server=http.createServer(async(req,res)=>{try{
const u=new URL(req.url,'http://'+(req.headers.host||'localhost'));
if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&!sameOrigin(req))return json(res,403,{ok:false,error:'CROSS_ORIGIN_REQUEST_BLOCKED'});
if(u.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,service:'TGC TRADE',listings:db.listings.length});
if(u.pathname==='/api/register'&&req.method==='POST'){
const d=await readBody(req,12000),name=clean(d.name,60),email=clean(d.email,254).toLowerCase(),password=d.password,location=clean(d.location,80)||'Philippines';
if(name.length<2)return json(res,400,{ok:false,error:'NAME_MUST_BE_AT_LEAST_2_CHARACTERS'});
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{ok:false,error:'VALID_EMAIL_REQUIRED'});
if(typeof password!=='string'||password.length<10||password.length>200)return json(res,400,{ok:false,error:'PASSWORD_MUST_BE_10_TO_200_CHARACTERS'});
if(db.users.some(x=>x.email===email))return json(res,409,{ok:false,error:'EMAIL_ALREADY_REGISTERED'});
const p=await hashPassword(password),user={id:id(12),name,location,email,passwordSalt:p.salt,passwordHash:p.hash,createdAt:Date.now()};
db.users.push(user);createSession(req,res,user);return json(res,201,{ok:true,user:publicUser(user)});
}
if(u.pathname==='/api/login'&&req.method==='POST'){
const ip=clean(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown',100).split(',')[0].trim();if(limited(ip))return json(res,429,{ok:false,error:'TOO_MANY_LOGIN_ATTEMPTS_TRY_LATER'});
const d=await readBody(req,12000),email=clean(d.email,254).toLowerCase(),password=typeof d.password==='string'?d.password:'',user=db.users.find(x=>x.email===email);
if(!user||!password||password.length>200)return json(res,401,{ok:false,error:'INVALID_EMAIL_OR_PASSWORD'});
const got=await scrypt(password,user.passwordSalt,64),expected=Buffer.from(user.passwordHash,'hex');
if(got.length!==expected.length||!crypto.timingSafeEqual(got,expected))return json(res,401,{ok:false,error:'INVALID_EMAIL_OR_PASSWORD'});
createSession(req,res,user);return json(res,200,{ok:true,user:publicUser(user)});
}
if(u.pathname==='/api/logout'&&req.method==='POST'){const token=cookie(req,'tgc_session');if(token){const h=crypto.createHash('sha256').update(token).digest('hex');db.sessions=db.sessions.filter(s=>s.tokenHash!==h);save()}res.setHeader('Set-Cookie',cookieHeader(req,'',0));return json(res,200,{ok:true})}
if(u.pathname==='/api/me'&&req.method==='GET'){const user=sessionFor(req);return user?json(res,200,{ok:true,user:publicUser(user)}):json(res,401,{ok:false,error:'LOGIN_REQUIRED'})}
if(u.pathname==='/api/profile'&&req.method==='PATCH'){const user=requireUser(req,res);if(!user)return;const d=await readBody(req,12000),name=clean(d.name,60);if(name.length<2)return json(res,400,{ok:false,error:'NAME_MUST_BE_AT_LEAST_2_CHARACTERS'});user.name=name;user.location=clean(d.location,80)||'Philippines';save();return json(res,200,{ok:true,user:publicUser(user)})}
if(u.pathname==='/api/my/listings'&&req.method==='GET'){const user=requireUser(req,res);if(!user)return;return json(res,200,{ok:true,listings:db.listings.filter(x=>x.ownerId===user.id).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(listingView)})}
if(u.pathname==='/api/listings'&&req.method==='GET')return json(res,200,{ok:true,listings:db.listings.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(listingView)});
if(u.pathname==='/api/listings'&&req.method==='POST'){
const user=requireUser(req,res);if(!user)return;const d=await readBody(req,12000000),name=clean(d.name,120);if(!name)return json(res,400,{ok:false,error:'CARD_NAME_REQUIRED'});
const item={id:id(10),ownerId:user.id,name,set:clean(d.set,120),price:Math.max(0,Number(d.price)||0),mode:['Sale','Trade','Both'].includes(d.mode)?d.mode:'Both',condition:clean(d.condition,60)||'Near Mint',location:user.location,seller:user.name,description:clean(d.description,1200),wants:clean(d.wants,500),photo:'',mediaType:'image',createdAt:Date.now()};
if(d.image&&typeof d.image==='object'&&typeof d.image.data==='string'){const ext=mimeExt(d.image.type);if(!ext)return json(res,400,{ok:false,error:'MEDIA_TYPE_NOT_SUPPORTED'});const video=['mp4','webm'].includes(ext),buf=Buffer.from(d.image.data,'base64'),maxBytes=video?8*1024*1024:5*1024*1024;if(buf.length>maxBytes)return json(res,413,{ok:false,error:video?'VIDEO_TOO_LARGE':'IMAGE_TOO_LARGE'});const valid=(ext==='jpg'&&buf[0]===255&&buf[1]===216)||(ext==='png'&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(ext==='webp'&&buf.toString('ascii',8,12)==='WEBP')||(ext==='mp4'&&buf.toString('ascii',4,8)==='ftyp')||(ext==='webm'&&buf.subarray(0,4).equals(Buffer.from([26,69,223,163])));if(!valid)return json(res,400,{ok:false,error:'MEDIA_CONTENT_DOES_NOT_MATCH_TYPE'});const fn=item.id+'-'+clean(d.image.name,80).replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,80)+'.'+ext;fs.writeFileSync(path.join(UPLOADS,fn),buf);item.photo='/uploads/'+fn;item.mediaType=video?'video':'image'}
db.listings.push(item);save();return json(res,201,{ok:true,listing:listingView(item)});
}
if(u.pathname.startsWith('/api/listings/')&&req.method==='GET'){const item=db.listings.find(x=>x.id===decodeURIComponent(u.pathname.split('/').pop()));return item?json(res,200,{ok:true,listing:listingView(item)}):json(res,404,{ok:false,error:'NOT_FOUND'})}
if(u.pathname.startsWith('/api/listings/')&&req.method==='DELETE'){const user=requireUser(req,res);if(!user)return;const key=decodeURIComponent(u.pathname.split('/').pop()),item=db.listings.find(x=>x.id===key);if(!item)return json(res,404,{ok:false,error:'NOT_FOUND'});if(item.ownerId!==user.id)return json(res,403,{ok:false,error:'NOT_YOUR_LISTING'});db.listings=db.listings.filter(x=>x.id!==key);save();return json(res,200,{ok:true})}
if(u.pathname==='/api/wants'&&req.method==='GET'){const user=requireUser(req,res);if(!user)return;return json(res,200,{ok:true,wants:db.wants.filter(x=>x.userId===user.id).map(x=>x.want)})}
if(u.pathname==='/api/wants'&&req.method==='POST'){const user=requireUser(req,res);if(!user)return;const d=await readBody(req,10000),want=clean(d.want,120);if(!want)return json(res,400,{ok:false,error:'WANT_REQUIRED'});if(!db.wants.some(x=>x.userId===user.id&&x.want.toLowerCase()===want.toLowerCase()))db.wants.push({userId:user.id,want});save();return json(res,201,{ok:true,wants:db.wants.filter(x=>x.userId===user.id).map(x=>x.want)})}
if(u.pathname==='/api/wants'&&req.method==='DELETE'){const user=requireUser(req,res);if(!user)return;const d=await readBody(req,10000);db.wants=db.wants.filter(x=>!(x.userId===user.id&&x.want===d.want));save();return json(res,200,{ok:true,wants:db.wants.filter(x=>x.userId===user.id).map(x=>x.want)})}
if(u.pathname.startsWith('/uploads/')){const file=path.basename(decodeURIComponent(u.pathname));return sendFile(res,path.join(UPLOADS,file),contentType(file))}
const rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1)),file=path.resolve(PUBLIC,rel);if(file!==PUBLIC&&!file.startsWith(PUBLIC+path.sep)){res.writeHead(403);return res.end('Forbidden')}return sendFile(res,file,contentType(file));
}catch(e){console.error(e);return json(res,e.status||500,{ok:false,error:e.status===413?'BODY_TOO_LARGE':e.status===400?'INVALID_JSON':'SERVER_ERROR'})}});
server.listen(PORT,HOST,()=>console.log('TGC TRADE running on '+HOST+':'+PORT));
