const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');process.chdir(root);require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});
const {readJsonStrict,writeJsonSafe}=require('../workers/app/lib/storage');const {resolveProjectPath}=require('../workers/app/lib/security');
const jobs=readJsonStrict(path.join(root,'database/operations/jobs.json'),[]);const job=jobs.find(j=>j.id===process.argv[2]);
async function main(){if(!job)throw new Error('Không tìm thấy tác vụ.');const p=job.params;const folder=resolveProjectPath(p.folder,p.type);let result;
 if(job.kind==='saydi'||job.kind==='capcut-tts'){
 const logName=(job.kind==='saydi'?'saydi_tts':'capcut_tts')+(p.scene!==undefined?`_scene_${p.scene}`:'')+'.log';const log=path.join(folder,logName);fs.writeFileSync(log,'Bắt đầu tác vụ giọng đọc tiếng Việt.\n');
 if(job.kind==='saydi')await require('../workers/app/lib/saydi_tts').processSaydiTts(p.folder,p.type,p.mode,p.scene,log);else await require('../workers/app/lib/capcut_tts').processTts(p.folder,p.type,p.mode,p.scene,log);
 result={folder:p.folder,type:p.type};
 }else if(job.kind==='vbee'||job.kind==='align'){
 const response=await require(`../workers/app/lib/tasks/${job.kind}`).runTask(new Request('http://localhost/internal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}));result=await response.json();if(!response.ok||result.success===false||result.status==='error')throw new Error(result.error||result.message||'Tác vụ thất bại.');
 }else throw new Error('Loại tác vụ không được hỗ trợ.');
 writeJsonSafe(path.join(root,'database/operations',`${job.id}.result.json`),result);}
main().catch(error=>{console.error(error);process.exitCode=1;});
