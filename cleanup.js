const GH_API='https://api.github.com';
const ghHeaders=token=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'});

function signature(v){
  let s=String(v||'').toLowerCase().replace(/\.zip$/,'');
  s=s.replace(/-\d+$/,'');
  s=s.replace(/(?:[-_. ]?v?\d+(?:[._-]\d+)*)$/,'');
  s=s.replace(/(?:[-_. ]?(?:final|fix|fixed|update|updated|copy|old|backup|test|new|rev|revision|수정|최종|구버전))+$/gi,'');
  return s.replace(/[^a-z0-9]/g,'');
}
async function readJson(r){const t=await r.text();try{return t?JSON.parse(t):{}}catch{return {message:t}}}

async function listAll(githubToken,vercelToken){
  const userR=await fetch(`${GH_API}/user`,{headers:ghHeaders(githubToken)}); const user=await readJson(userR);
  if(!userR.ok)throw new Error(`GitHub 사용자 확인 실패: ${user.message||userR.status}`);
  const owner=String(user.login||'');
  const repoR=await fetch(`${GH_API}/user/repos?per_page=100&affiliation=owner&sort=updated`,{headers:ghHeaders(githubToken)}); const reposRaw=await readJson(repoR);
  if(!repoR.ok)throw new Error(`GitHub 목록 확인 실패: ${reposRaw.message||repoR.status}`);
  const projR=await fetch('https://api.vercel.com/v9/projects?limit=100',{headers:{Authorization:`Bearer ${vercelToken}`}}); const projsRaw=await readJson(projR);
  if(!projR.ok)throw new Error(`Vercel 목록 확인 실패: ${projsRaw?.error?.message||projsRaw.message||projR.status}`);

  const repos=(Array.isArray(reposRaw)?reposRaw:[]).map(x=>({name:String(x.name||''),updatedAt:x.updated_at||'',url:x.html_url||'',private:!!x.private}));
  const projects=(Array.isArray(projsRaw.projects)?projsRaw.projects:[]).map(x=>({name:String(x.name||''),updatedAt:x.updatedAt||x.createdAt||'',id:x.id||'',url:`https://${x.name}.vercel.app`}));
  const names=[...new Set([...repos.map(x=>x.name),...projects.map(x=>x.name)])];
  const groups=new Map();
  for(const name of names){const sig=signature(name)||name.toLowerCase();if(!groups.has(sig))groups.set(sig,[]);groups.get(sig).push(name)}
  const duplicates=new Set();
  for(const arr of groups.values())if(arr.length>1)arr.forEach(x=>duplicates.add(x.toLowerCase()));
  const items=names.map(name=>{
    const repo=repos.find(x=>x.name.toLowerCase()===name.toLowerCase());
    const project=projects.find(x=>x.name.toLowerCase()===name.toLowerCase());
    const pair=!!repo&&!!project;
    return {name,signature:signature(name),github:!!repo,vercel:!!project,pair,duplicate:duplicates.has(name.toLowerCase()),githubUrl:repo?.url||'',vercelUrl:project?.url||'',updatedAt:repo?.updatedAt||project?.updatedAt||''};
  }).sort((a,b)=>Number(b.duplicate)-Number(a.duplicate)||Number(b.pair)-Number(a.pair)||String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return {owner,items};
}

async function deleteTargets({githubToken,vercelToken,targets,protectNames}){
  if(!Array.isArray(targets)||!targets.length)throw new Error('삭제할 앱을 선택하세요.');
  const protectedSet=new Set((protectNames||[]).map(x=>String(x||'').toLowerCase()).filter(Boolean));
  const userR=await fetch(`${GH_API}/user`,{headers:ghHeaders(githubToken)}); const user=await readJson(userR);
  if(!userR.ok)throw new Error(`GitHub 사용자 확인 실패: ${user.message||userR.status}`);
  const owner=String(user.login||'');
  const results=[];
  for(const t of targets){
    const name=String(t?.name||'').trim(); if(!name)continue;
    if(protectedSet.has(name.toLowerCase())){results.push({name,ok:false,error:'현재 사용 중/보호 앱이라 삭제하지 않았습니다.'});continue}
    const result={name,github:null,vercel:null,ok:true};
    if(t.github){
      const r=await fetch(`${GH_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,{method:'DELETE',headers:ghHeaders(githubToken)});
      if(r.status===204||r.status===404)result.github='deleted';else{const d=await readJson(r);result.github='failed';result.ok=false;result.error=`GitHub: ${d.message||r.status}`}
    }
    if(t.vercel){
      const r=await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(name)}`,{method:'DELETE',headers:{Authorization:`Bearer ${vercelToken}`}});
      if(r.ok||r.status===404)result.vercel='deleted';else{const d=await readJson(r);result.vercel='failed';result.ok=false;result.error=[result.error,`Vercel: ${d?.error?.message||d.message||r.status}`].filter(Boolean).join(' · ')}
    }
    results.push(result);
  }
  return results;
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST만 지원합니다.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const {action,githubToken,vercelToken}=body;
    if(!githubToken||!vercelToken)return res.status(400).json({ok:false,error:'GitHub/Vercel 토큰이 필요합니다.'});
    if(action==='list')return res.json({ok:true,...await listAll(githubToken,vercelToken)});
    if(action==='delete'){
      if(body.confirmText!=='선택 삭제')return res.status(400).json({ok:false,error:'삭제 확인 문구가 맞지 않습니다.'});
      const results=await deleteTargets(body);
      return res.json({ok:true,results});
    }
    return res.status(400).json({ok:false,error:'지원하지 않는 작업입니다.'});
  }catch(e){return res.status(400).json({ok:false,error:e?.message||'앱 정리 중 오류가 발생했습니다.'})}
}
