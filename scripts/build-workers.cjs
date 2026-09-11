const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.ts')){const target=path.join(root,'workers',path.relative(root,file)).replace(/\.ts$/,'.js');fs.mkdirSync(path.dirname(target),{recursive:true});const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});fs.writeFileSync(target,result.outputText);}}}
walk(path.join(root,'app/lib'));fs.mkdirSync(path.join(root,'workers/config'),{recursive:true});fs.copyFileSync(path.join(root,'config/channel_config.json'),path.join(root,'workers/config/channel_config.json'));
console.log('Worker modules built.');
