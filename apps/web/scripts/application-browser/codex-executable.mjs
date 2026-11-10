import {existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
/** Resolve npm/user Windows shims without shell parsing prompt arguments. */
export function resolveCodexExecutable({platform=process.platform,pathValue=process.env.PATH||'',configured=process.env.AIADAPPLY_CODEX_EXECUTABLE}={}){
 if(configured&&/\.(?:exe|mjs|cjs|js)$/i.test(configured))return configured;
 if(platform!=='win32')return configured||'codex';
 const directories=pathValue.split(';').map(v=>v.replace(/^"|"$/g,'')).filter(Boolean);
 if(configured&&/\.(?:cmd|bat)$/i.test(configured))directories.unshift(path.dirname(configured));
 for(const directory of [...new Set(directories)]){
  const root=path.join(directory,'node_modules','@openai','codex');
  const packages=path.join(root,'node_modules','@openai');
  let entries=[];try{entries=readdirSync(packages,{withFileTypes:true});}catch{}
  for(const entry of entries.filter(v=>v.isDirectory()&&v.name.startsWith('codex-win32-')).sort((a,b)=>a.name.localeCompare(b.name))){
   const queue=[{dir:path.join(packages,entry.name,'vendor'),depth:0}];
   while(queue.length){const current=queue.shift();if(current.depth>5)continue;let files=[];try{files=readdirSync(current.dir,{withFileTypes:true});}catch{continue;}
    for(const file of files){const name=path.join(current.dir,file.name);if(file.isFile()&&file.name.toLowerCase()==='codex.exe')return name;if(file.isDirectory())queue.push({dir:name,depth:current.depth+1});}
   }
  }
  const script=path.join(root,'bin','codex.js');if(existsSync(script))return script;
 }
 return configured||'codex';
}
