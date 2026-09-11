const fs=require('fs'),path=require('path'),{spawn,execFile}=require('child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);require('dotenv').config({path:path.join(root,'.env.local'),quiet:true});
const {readJsonStrict,writeJsonSafe,updateJson,withFileLock}=require('../workers/app/lib/storage');
const {toVNTime}=require('../workers/app/lib/time');const {CHANNEL_INSTRUCTION}=require('../workers/app/lib/channel');
const {resolveProjectPath,resolveProjectInput}=require('../workers/app/lib/security');
const ops=path.join(root,'database/operations'),jobsFile=path.join(ops,'jobs.json');fs.mkdirSync(ops,{recursive:true});
const python=process.env.VUTRU_PYTHON || (fs.existsSync(path.join(root,'.venv/Scripts/python.exe'))?path.join(root,'.venv/Scripts/python.exe'):'python');
const readJobs=()=>readJsonStrict(jobsFile,[]);
async function patchJob(id,patch){await updateJson(jobsFile,[],rows=>rows.map(j=>j.id===id?{...j,...patch,updatedAt:toVNTime()}:j));}
async function patchQueue(job,status,error,outputFolder){if(!['script','veo'].includes(job.kind))return;await updateJson(path.join(root,job.kind==='script'?'queue.json':'veo_queue.json'),[],rows=>rows.map(t=>t.id===job.params.taskId?{...t,status,errorMessage:error||undefined,...(outputFolder?{outputFolder}:{}),progress:status==='completed'?100:status==='processing'?5:0,workerId:String(process.pid),updatedAt:toVNTime()}:t));}
function stopTree(pid){if(process.platform==='win32')execFile('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true},()=>{});else {try{process.kill(-pid,'SIGTERM');}catch{try{process.kill(pid,'SIGTERM');}catch{}}}}
function runChild(command,args,job,input){return new Promise((resolve,reject)=>{
 const log=fs.openSync(path.join(ops,`${job.id}.log`),'a');const child=spawn(command,args,{cwd:root,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe',log,log],env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});let settled=false;let cancelled=false;let timedOut=false;const start=Date.now();
 const finish=error=>{if(settled)return;settled=true;clearInterval(timer);fs.closeSync(log);error?reject(error):resolve();};
 const timer=setInterval(()=>{const j=readJobs().find(j=>j.id===job.id);cancelled=j?.status==='cancel_requested';timedOut=Date.now()-start>Number(process.env.VUTRU_JOB_TIMEOUT_MS||21600000);if(cancelled||timedOut){if(child.pid)stopTree(child.pid);}else patchJob(job.id,{workerPid:process.pid,childPid:child.pid}).catch(()=>{});},5000);
 child.on('error',finish);child.on('close',code=>finish(cancelled?new Error('CANCELLED'):timedOut?new Error('Tác vụ vượt thời gian tối đa.'):code===0?null:new Error(`Tiến trình kết thúc với mã ${code}. Xem log tác vụ.`)));child.stdin.on('error',()=>{});child.stdin.end(input||'');
 });}
async function runAI(job,instruction){
 const model=job.params.aiModel==='codex'?'codex':'agy';const promptFile=path.join(ops,`${job.id}.prompt.txt`);fs.writeFileSync(promptFile,`${CHANNEL_INSTRUCTION}\n${instruction}`);
 let command=model; if(model==='agy'&&process.platform==='win32'&&process.env.LOCALAPPDATA){const candidate=path.join(process.env.LOCALAPPDATA,'agy/bin/agy.exe');if(fs.existsSync(candidate))command=candidate;}
 const args=model==='codex'?['exec','--sandbox','workspace-write','--json','-C',root,'-']:['--input-format','text','--output-format','text','--mode','accept-edits','--sandbox','--print-timeout','6h','--add-dir',root];
 if(process.platform==='win32'){
  const quote=s=>`'${String(s).replace(/'/g,"''")}'`;const script=`$ErrorActionPreference='Stop'; $OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Get-Content -LiteralPath ${quote(promptFile)} -Raw -Encoding UTF8 | & ${quote(command)} ${args.map(quote).join(' ')}; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }`;
  await runChild('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],job);
 }else await runChild(command,args,job,fs.readFileSync(promptFile,'utf8'));
}
async function execute(job){
 if(readJobs().find(j=>j.id===job.id)?.status==='cancel_requested')throw new Error('CANCELLED');
 const p=job.params;const resultFile=path.join(ops,`${job.id}.result.json`);
 if(job.kind==='script'||job.kind==='veo'){
  if(fs.existsSync(resultFile))fs.unlinkSync(resultFile);
  const instructions=job.kind==='script'?`Read .agents/AGENTS.md, .agents/00_runtime_contract.md and .agents/skills/ProcessQueue/SKILL.md. Follow the canonical 11 steps for this exact task context: ${JSON.stringify(p)}. Load detailed guides only when their step is reached. Write the Step 11 history entry through .agents/tools/complete_project.py, following its --help. The background worker owns queue status; do not modify queue.json or start another worker. After successful canonical completion write ${JSON.stringify(resultFile)} as JSON {"folder":"the-project-slug","type":"${p.videoType}"}.`:`Read .agents/AGENTS.md, .agents/00_runtime_contract.md and .agents/skills/GenerateVeoPrompts/SKILL.md. Fully regenerate the Vietnamese Buddhist project ${JSON.stringify(p.outputFolder)}. Respect every batch gate and final QA. Do not modify veo_queue.json. After success write ${JSON.stringify(resultFile)} as JSON {"folder":${JSON.stringify(p.folder)},"type":${JSON.stringify(p.type)}}.`;
  await runAI(job,instructions);
  const result=readJsonStrict(resultFile,null);if(!result)throw new Error('Agent chưa ghi kết quả đã xác minh.');if(result.type!==(p.videoType||p.type))throw new Error('Loại dự án kết quả không khớp yêu cầu.');const folder=resolveProjectPath(result.folder,result.type);
  await runChild(python,[path.join(root,'.agents/tools/qa_automation.py'),'--folder',folder,'--lang','vi',...(p.mode?['--mode',String(p.mode)]:[])],job);
  const history=readJsonStrict(path.join(root,'database/history.json'),[]);if(!history.some(h=>h.folder===result.folder&&h.type===result.type))throw new Error('Chưa có bản ghi lịch sử sau QA.');
  return {folder:result.folder,type:result.type,outputFolder:path.relative(root,folder).replace(/\\/g,'/')};
 }
 const folder=resolveProjectPath(p.folder,p.type);
 if(job.kind==='seo'){
  await runAI(job,`Follow .agents/skills/OptimizeSEO/SKILL.md for project ${JSON.stringify(folder)}, video type ${p.type}, language vi. Use actual chapter timelines. Save only canonical metadata fields and seo_optimized.json. Complete its QA.`);
  await runChild(python,[path.join(root,'.agents/tools/seo_qa.py'),'--folder',folder,'--lang','vi','--video-type',p.type],job);return {folder:p.folder,type:p.type};
 }
 if(job.kind==='thumbnail'){
  const previous=fs.existsSync(path.join(folder,'thumbnail.png'))?require('crypto').createHash('sha256').update(fs.readFileSync(path.join(folder,'thumbnail.png'))).digest('hex'):null;
  await runAI(job,`Read .agents/thumbnail_guide.md. Create a respectful Buddhist thumbnail for ${JSON.stringify(folder)} from its actual master script and metadata title. Save thumbnail.png. Do not invent a different topic. Use an available image-generation capability; if unavailable report failure, never use a placeholder.`);
  const image=path.join(folder,'thumbnail.png');if(!fs.existsSync(image)||fs.statSync(image).size<1000)throw new Error('Chưa tạo được thumbnail hợp lệ.');const bytes=fs.readFileSync(image);if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||require('crypto').createHash('sha256').update(bytes).digest('hex')===previous)throw new Error('Thumbnail chưa được tạo mới đúng định dạng PNG.');return {folder:p.folder,type:p.type};
 }
 await runChild(process.execPath,[path.join(root,'scripts/task-executor.cjs'),job.id],job);
 return readJsonStrict(resultFile,{folder:p.folder,type:p.type});
}
async function main(){await withFileLock(path.join(ops,'worker'),async()=>{
 for(const job of readJobs().filter(j=>['processing','cancel_requested'].includes(j.status))){if(job.childPid){let alive=false;try{process.kill(job.childPid,0);alive=true;}catch{}if(alive)throw new Error('Tác vụ '+job.id+' có tiến trình còn chạy sau gián đoạn. Chờ tiến trình kết thúc trước khi phục hồi worker.');}await patchJob(job.id,{status:'error',error:'Worker trước bị gián đoạn. Kiểm tra output trước khi thử lại.'});await patchQueue(job,'error','Worker bị gián đoạn.');}
 while(true){const job=readJobs().find(j=>j.status==='pending');if(!job)break;
  let claimed=false;await updateJson(jobsFile,[],rows=>rows.map(j=>{if(j.id!==job.id||j.status!=='pending')return j;claimed=true;return {...j,status:'processing',workerPid:process.pid,error:undefined,updatedAt:toVNTime()};}));if(!claimed)continue;await patchQueue(job,'processing');
  try{const result=await execute(job);await patchJob(job.id,{status:'completed',result,childPid:undefined});await patchQueue(job,'completed',undefined,result?.outputFolder);}
  catch(error){const cancelled=error.message==='CANCELLED';await patchJob(job.id,{status:cancelled?'cancelled':'error',error:error.message,childPid:undefined});await patchQueue(job,cancelled?'cancelled':'error',error.message);}
 }
 },150);}
main().catch(error=>{if(!String(error.message).includes('đang được cập nhật'))fs.appendFileSync(path.join(ops,'worker-error.log'),`${toVNTime()} ${error.stack}\n`);});
