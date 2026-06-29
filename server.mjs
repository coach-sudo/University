import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY || '';
const USER_AGENT = 'MateriaUniversity/0.2 (local research prototype)';

const json = (res, status, body) => {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>15_000_000) throw new Error('Request too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function fetchJson(url, options={}) {
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch(url,{...options,signal:controller.signal,headers:{'user-agent':USER_AGENT,'accept':'application/json',...(options.headers||{})}});
    if(!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

const stripTags = value => String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
const first = value => Array.isArray(value) ? value[0] : value;
const yearFromParts = parts => parts?.['date-parts']?.[0]?.[0] || null;

async function searchCrossref(topic) {
  const params=new URLSearchParams({'query.bibliographic':topic,rows:'50',filter:'type:journal-article',select:'DOI,title,author,published,issued,is-referenced-by-count,URL,publisher,type,container-title,abstract,subject,link'});
  const data=await fetchJson(`https://api.crossref.org/works?${params}`);
  const terms=topic.toLowerCase().split(/[^a-z0-9]+/).filter(term=>term.length>2);
  return (data.message?.items||[]).map((work,index)=>({
    id:`doi:${work.DOI||index}`, kind:'paper', title:stripTags(first(work.title))||'Untitled scholarly work',
    authors:(work.author||[]).slice(0,5).map(a=>[a.given,a.family].filter(Boolean).join(' ')),
    year:yearFromParts(work.published)||yearFromParts(work.issued), venue:stripTags(first(work['container-title']))||work.publisher||'Scholarly publication',
    citations:Number(work['is-referenced-by-count']||0), url:work.URL||`https://doi.org/${work.DOI}`,
    doi:work.DOI||null, abstract:stripTags(work.abstract).slice(0,1000), subjects:(work.subject||[]).slice(0,6),
    quality:'Journal article', qualityNote:'Scholarly metadata from Crossref. Confirm peer-review policy with the journal.'
  })).filter(x=>x.title&&!/^(reviewers?|editorial board|contents?|front matter|announcement|publisher'?s note|erratum|corrigendum|retraction)\b/i.test(x.title)).filter(x=>x.authors.length||x.citations||x.abstract).map(source=>{
    const haystack=`${source.title} ${source.abstract} ${source.venue} ${(source.subjects||[]).join(' ')}`.toLowerCase();
    const coverage=terms.length?terms.filter(term=>haystack.includes(term)).length/terms.length:0;
    return {...source,relevanceScore:coverage*100+Math.log10(source.citations+1)*5+(source.abstract?8:0)};
  }).filter(source=>source.relevanceScore>=45).sort((a,b)=>b.relevanceScore-a.relevanceScore).slice(0,18);
}

async function searchWikipedia(topic) {
  const search=await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=4&format=json&origin=*`);
  const hits=search.query?.search||[];
  const pages=await Promise.all(hits.slice(0,3).map(async hit=>{
    try {
      const summary=await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replaceAll(' ','_'))}`);
      return {id:`wiki:${summary.pageid||hit.pageid}`,kind:'reference',title:summary.title,description:summary.extract||stripTags(hit.snippet),url:summary.content_urls?.desktop?.page||`https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replaceAll(' ','_'))}`,thumbnail:summary.thumbnail?.source||null,quality:'Reference overview'};
    } catch { return null; }
  }));
  return pages.filter(Boolean);
}

async function searchBooks(topic) {
  const data=await fetchJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(topic)}&limit=8&fields=key,title,author_name,first_publish_year,publisher,edition_count,cover_i`);
  const seen=new Set();return (data.docs||[]).map((book,index)=>({id:`book:${book.key||index}`,kind:'book',title:book.title,authors:(book.author_name||[]).slice(0,3),year:book.first_publish_year||null,venue:first(book.publisher)||'Open Library',editions:book.edition_count||0,url:`https://openlibrary.org${book.key}`,thumbnail:book.cover_i?`https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`:null,quality:'Book record'})).filter(book=>{const key=`${book.title}`.toLowerCase().replace(/[^a-z0-9]/g,'');if(seen.has(key))return false;seen.add(key);return true}).slice(0,6);
}

async function searchTools(topic) {
  const data=await fetchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(topic)}&sort=stars&order=desc&per_page=8`,{headers:{'accept':'application/vnd.github+json','x-github-api-version':'2022-11-28'}});
  return (data.items||[]).slice(0,6).map(repo=>({id:`github:${repo.id}`,kind:'tool',title:repo.name,description:repo.description||'Open-source project',url:repo.html_url,stars:repo.stargazers_count,language:repo.language,updated:repo.updated_at,owner:repo.owner?.login,quality:'Open-source tool'}));
}

function collectVideoRenderers(root) {
  const found=[];
  const walk=node=>{ if(!node||typeof node!=='object') return; if(node.videoRenderer) found.push(node.videoRenderer); for(const value of Object.values(node)) walk(value); };
  walk(root); return found;
}

async function searchVideos(topic) {
  if(YOUTUBE_KEY) {
    const params=new URLSearchParams({part:'snippet',q:`${topic} university lecture`,type:'video',maxResults:'8',videoEmbeddable:'true',safeSearch:'strict',key:YOUTUBE_KEY});
    const data=await fetchJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
    return (data.items||[]).map(item=>({id:item.id.videoId,kind:'video',title:item.snippet.title,channel:item.snippet.channelTitle,description:item.snippet.description,url:`https://www.youtube.com/watch?v=${item.id.videoId}`,embed:`https://www.youtube-nocookie.com/embed/${item.id.videoId}`,thumbnail:item.snippet.thumbnails?.high?.url||item.snippet.thumbnails?.medium?.url,provider:'YouTube Data API'}));
  }
  const response=await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(topic+' university lecture')}`,{headers:{'user-agent':'Mozilla/5.0'}});
  if(!response.ok) throw new Error(`YouTube ${response.status}`);
  const html=await response.text();
  const match=html.match(/var ytInitialData = (\{.+?\});<\/script>/s);
  if(!match) return [];
  const renderers=collectVideoRenderers(JSON.parse(match[1])); const seen=new Set();
  return renderers.filter(v=>v.videoId&&!seen.has(v.videoId)&&seen.add(v.videoId)).map(v=>({
    id:v.videoId,kind:'video',title:v.title?.runs?.map(r=>r.text).join('')||'YouTube lecture',channel:v.ownerText?.runs?.[0]?.text||'YouTube',description:v.descriptionSnippet?.runs?.map(r=>r.text).join('')||'',url:`https://www.youtube.com/watch?v=${v.videoId}`,embed:`https://www.youtube-nocookie.com/embed/${v.videoId}`,thumbnail:v.thumbnail?.thumbnails?.at(-1)?.url||`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,provider:'YouTube web result'
  })).map(video=>({...video,qualityScore:(/(university|college|institute|institution|association|museum|academy|extension|master gardener)/i.test(video.channel)?20:0)+(/lecture|course|introduction|explained|101|ecosystem|seminar/i.test(video.title)?12:0)})).sort((a,b)=>b.qualityScore-a.qualityScore).filter((video,index,array)=>array.findIndex(x=>x.title.toLowerCase()===video.title.toLowerCase())===index).slice(0,6);
}

async function extractMaterials(materials=[]) {
  const out=[];
  for(const item of materials.slice(0,8)) {
    if(item.text) { out.push({name:item.name,type:item.type||'text',text:String(item.text).slice(0,60000)}); continue; }
    if(item.base64&&item.type==='application/pdf') {
      try {
        const pdfjs=await import('file:///C:/Users/dariu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
        const doc=await pdfjs.getDocument({data:Uint8Array.from(Buffer.from(item.base64,'base64'))}).promise; const pages=[];
        for(let i=1;i<=Math.min(doc.numPages,80);i++){const page=await doc.getPage(i);const content=await page.getTextContent();pages.push(content.items.map(x=>x.str).join(' '));}
        out.push({name:item.name,type:item.type,text:pages.join('\n').slice(0,120000)});
      } catch(error) { out.push({name:item.name,type:item.type,text:'',error:`PDF extraction failed: ${error.message}`}); }
    }
  }
  return out;
}

async function researchTopic(input) {
  const topic=String(input.topic||'').trim(); if(!topic) throw new Error('A topic is required');
  const materials=await extractMaterials(input.materials||[]);
  const settled=await Promise.allSettled([searchCrossref(topic),searchWikipedia(topic),searchBooks(topic),searchVideos(topic),searchTools(topic)]);
  const names=['papers','references','books','videos','tools']; const result={topic,materials,queriedAt:new Date().toISOString(),errors:[]};
  settled.forEach((entry,i)=>{if(entry.status==='fulfilled') result[names[i]]=entry.value; else {result[names[i]]=[];result.errors.push(`${names[i]}: ${entry.reason.message}`);}});
  result.stats={papers:result.papers.length,references:result.references.length,books:result.books.length,videos:result.videos.length,tools:result.tools.length,materials:materials.filter(x=>x.text).length};
  result.summary=result.references[0]?.description||result.papers.find(p=>p.abstract)?.abstract||`A source map for ${topic}.`;
  result.system={aiConfigured:Boolean(OPENAI_KEY),aiModel:OPENAI_KEY?OPENAI_MODEL:null,youtubeOfficial:Boolean(YOUTUBE_KEY)};
  return result;
}

function compareResearch(previous={},fresh={}) {
  const keys=['papers','references','books','videos','tools'];const before=new Map(),after=new Map();
  keys.forEach(key=>(previous[key]||[]).forEach(item=>before.set(`${key}:${item.id||item.url||item.title}`,item)));
  keys.forEach(key=>(fresh[key]||[]).forEach(item=>after.set(`${key}:${item.id||item.url||item.title}`,item)));
  return {checkedAt:fresh.queriedAt,newSources:[...after.entries()].filter(([id])=>!before.has(id)).map(([,item])=>item),removedSources:[...before.entries()].filter(([id])=>!after.has(id)).map(([,item])=>item),previousCount:before.size,currentCount:after.size};
}

async function refreshResearch(previous) {
  const fresh=await researchTopic({topic:previous.topic,materials:previous.materials||[]});
  return {research:fresh,delta:compareResearch(previous,fresh)};
}

function fallbackCourse(research,weeks,answers={}) {
  const topic=research.topic; const paperTitles=research.papers.slice(0,8).map(x=>x.title); const overview=research.summary;
  const modules=[
    {title:'Foundations & language',purpose:`Build the vocabulary and historical map needed to think clearly about ${topic}.`,lessons:['Origins and first principles','The field’s core vocabulary','A map of the major schools']},
    {title:'Evidence & methods',purpose:'Learn how knowledge is produced, tested, challenged, and revised.',lessons:['How experts know what they know','Read a landmark study closely','Methods lab: test a claim']},
    {title:'Systems & context',purpose:`Connect ${topic} to adjacent fields, institutions, cultures, and material conditions.`,lessons:['Parts, patterns, and systems','Culture, power, and place','What changes across contexts']},
    {title:'Practice & live debate',purpose:'Move from comprehension to judgment through cases and competing explanations.',lessons:['Apply the core toolkit','A debate with no easy answer','Case studio and peer critique']},
    {title:'Original contribution',purpose:'Synthesize the field and produce defensible original work.',lessons:['Find the gap','Build and test your position','Capstone: make it useful']}
  ];
  const readingPool=[...research.papers,...research.books].slice(0,12);
  return {
    mode:'source-driven', title:topic, subtitle:`A ${weeks}-week evidence-based program`, overview,
    learner:{mastery:answers.lens||'',startingPoint:answers.outcome||'',preference:answers.style||''}, modules,
    lesson:{title:`How ${topic} became a field`,dek:`Trace the questions, evidence, and disagreements that organize ${topic}.`,summary:overview,readings:readingPool.slice(0,4),video:research.videos[0]||null,tools:research.tools.slice(0,3),questions:[`What counts as strong evidence in ${topic}?`,`Which foundational assumption is most contested?`,`What would change an expert’s mind?`]},
    assessment:{prompt:`Use at least two course sources to explain a central tension in ${topic}. Apply the tension to a new case, then state what evidence would change your conclusion.`,rubric:['Conceptual accuracy','Use and interpretation of evidence','Transfer to a new case','Counterargument and revision','Clarity and intellectual honesty']},
    provenance:{sourceCount:(research.papers.length+research.references.length+research.books.length),materialCount:research.materials.filter(x=>x.text).length,paperTitles}
  };
}

function extractResponseText(data) {
  if(typeof data.output_text==='string') return data.output_text;
  for(const item of data.output||[]) for(const content of item.content||[]) if(content.type==='output_text'&&content.text) return content.text;
  return '';
}

async function aiCourse(research,weeks,answers) {
  const compact={topic:research.topic,summary:research.summary,papers:research.papers.slice(0,12).map(({title,authors,year,venue,citations,url,abstract})=>({title,authors,year,venue,citations,url,abstract})),books:research.books.slice(0,5),videos:research.videos.slice(0,5).map(({title,channel,url})=>({title,channel,url})),tools:research.tools.slice(0,5).map(({title,description,url,stars})=>({title,description,url,stars})),materials:research.materials.map(m=>({name:m.name,text:m.text.slice(0,12000)}))};
  const prompt=`You are the curriculum architect for an advanced AI university. Build a rigorous ${weeks}-week course. Respect the learner answers ${JSON.stringify(answers)}. Use only claims supported by the supplied source map; cite source URLs beside claims. Treat uploaded material as the learner's perspective, not automatically as fact. Include 5 modules with 3 lessons each, a detailed first lesson, multimodal activities, a capstone, and a five-part grading rubric. Return ONLY valid JSON matching the structure of this example (content may differ): ${JSON.stringify(fallbackCourse(research,weeks,answers))}\nSOURCE MAP:\n${JSON.stringify(compact)}`;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'authorization':`Bearer ${OPENAI_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:OPENAI_MODEL,input:prompt,reasoning:{effort:'medium'},max_output_tokens:12000})});
  if(!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0,300)}`);
  const text=extractResponseText(await response.json()).trim().replace(/^```json\s*/,'').replace(/```$/,'');
  const course=JSON.parse(text); course.mode=`ai:${OPENAI_MODEL}`; return course;
}

async function buildCourse(input) {
  const {research,delta}=await refreshResearch(input.research);const base=fallbackCourse(research,Number(input.weeks||12),input.answers||{});
  const decorate=course=>({...course,liveResearch:research,researchAudit:{stage:'course-generation',...delta}});
  if(!OPENAI_KEY) return decorate({...base,notice:'Research was refreshed during generation. AI synthesis is not configured, so the course was assembled deterministically from the current source map.'});
  try { return decorate(await aiCourse(research,Number(input.weeks||12),input.answers||{})); }
  catch(error) { return decorate({...base,notice:`Research was refreshed, but AI synthesis failed. The source-driven course was used: ${error.message}`}); }
}

async function resolveSource(input) {
  const query=String(input.query||'').trim();if(!query)throw new Error('A DOI, title, or URL is required');
  const youtube=query.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/i);
  if(youtube){const url=`https://www.youtube.com/watch?v=${youtube[1]}`;const info=await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);return{id:youtube[1],kind:'video',title:info.title,channel:info.author_name,url,embed:`https://www.youtube-nocookie.com/embed/${youtube[1]}`,thumbnail:info.thumbnail_url,provider:'YouTube oEmbed',quality:'Manually added video'};}
  const doi=(query.match(/10\.\d{4,9}\/[\w.()/:;-]+/i)||[])[0];
  if(doi){const data=await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);const work=data.message;return{id:`doi:${work.DOI}`,kind:'paper',title:stripTags(first(work.title)),authors:(work.author||[]).slice(0,5).map(a=>[a.given,a.family].filter(Boolean).join(' ')),year:yearFromParts(work.published)||yearFromParts(work.issued),venue:stripTags(first(work['container-title']))||work.publisher||'Scholarly publication',citations:Number(work['is-referenced-by-count']||0),url:work.URL||`https://doi.org/${work.DOI}`,doi:work.DOI,abstract:stripTags(work.abstract).slice(0,1000),quality:'Journal article',qualityNote:'Resolved through Crossref; verify the journal peer-review policy.'};}
  const papers=await searchCrossref(query);if(papers[0])return papers[0];
  if(/^https?:\/\//i.test(query))return{id:`manual:${Date.now()}`,kind:'reference',title:query,url:query,description:'External URL added by the learner',quality:'Needs verification'};
  throw new Error('No scholarly record was found. Try a DOI, a more specific title, or a complete URL.');
}

async function gradeResponse(input) {
  const text=String(input.response||'').trim(); const sources=input.sources||[]; const words=text.split(/\s+/).filter(Boolean).length;
  const reasoning=(text.match(/\b(because|therefore|however|although|implies|suggests|whereas|consequently)\b/gi)||[]).length;
  const evidence=(text.match(/\b(evidence|study|research|source|data|according|citation|doi)\b/gi)||[]).length;
  const nuance=(text.match(/\b(limitation|counter|uncertain|alternative|bias|depends|context|would change)\b/gi)||[]).length;
  const sourceMatches=sources.filter(s=>text.toLowerCase().includes(String(s.title||'').toLowerCase().split(/[:—-]/)[0].slice(0,22))).length;
  const dimensions={conceptualAccuracy:Math.min(96,48+Math.round(words/7)+reasoning*3),evidenceUse:Math.min(96,40+evidence*8+sourceMatches*12),transfer:Math.min(94,50+reasoning*4+nuance*4),counterargument:Math.min(95,42+nuance*9),clarity:Math.min(94,58+Math.min(20,Math.round(words/12)))};
  const score=Math.round(Object.values(dimensions).reduce((a,b)=>a+b,0)/5);
  const stop=new Set(['about','after','again','against','because','before','being','between','could','every','first','from','have','into','more','other','should','their','there','these','they','this','through','under','using','what','when','where','which','while','with','would']);
  const queryTerms=[...new Set(text.toLowerCase().match(/[a-z]{5,}/g)||[])].filter(word=>!stop.has(word)).slice(0,5);let freshPapers=[];let researchError=null;
  try{freshPapers=await searchCrossref(`${input.topic||''} ${queryTerms.join(' ')}`)}catch(error){researchError=error.message}
  const assignedIds=new Set(sources.map(source=>source.doi||source.id||source.url));const newEvidence=freshPapers.filter(paper=>!assignedIds.has(paper.doi||paper.id||paper.url)).slice(0,4);
  return {mode:'transparent-rubric-engine + live Crossref check',score,dimensions,feedback:score<60?'Build one clear claim, support it with a named course source, and explain the reasoning between them.':evidence<2?'Your reasoning is developing. Add and interpret at least two specific course sources; do not merely name them.':nuance<1?'Your evidence use is stronger. Now test the claim against a limitation, counterexample, or competing explanation.':/would change|change my (mind|conclusion)/i.test(text)?'Strong structure. Quantify your change-your-mind condition and audit the quality and limitations of the sources you used.':'Strong structure. Your next revision should state what new evidence would make you change your conclusion.',trace:{words,reasoningMarkers:reasoning,evidenceMarkers:evidence,nuanceMarkers:nuance,matchedSources:sourceMatches},researchCheck:{checkedAt:new Date().toISOString(),query:`${input.topic||''} ${queryTerms.join(' ')}`.trim(),papersChecked:freshPapers.length,newEvidence,researchError}};
}

async function researchTutor(input) {
  const topic=String(input.topic||'').trim(),question=String(input.question||'').trim();if(!topic||!question)throw new Error('Topic and question are required');
  const terms=[...new Set(question.toLowerCase().match(/[a-z]{4,}/g)||[])].slice(0,7);const [paperResult,referenceResult]=await Promise.allSettled([searchCrossref(`${topic} ${terms.join(' ')}`),searchWikipedia(`${topic} ${terms.slice(0,3).join(' ')}`)]);
  const papers=paperResult.status==='fulfilled'?paperResult.value.slice(0,6):[];const references=referenceResult.status==='fulfilled'?referenceResult.value.slice(0,2):[];const sources=[...papers,...references];
  if(OPENAI_KEY){
    const prompt=`You are a rigorous university tutor. Answer the learner's question using only the supplied current sources. Separate established evidence, reasonable inference, and uncertainty. Cite URLs inline. If the sources are insufficient, say so and propose a better research question. Topic: ${topic}\nQuestion: ${question}\nSources: ${JSON.stringify(sources.map(({title,authors,year,venue,url,abstract,description,citations})=>({title,authors,year,venue,url,abstract,description,citations})))}`;
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'authorization':`Bearer ${OPENAI_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:OPENAI_MODEL,input:prompt,reasoning:{effort:'medium'},max_output_tokens:2500})});
    if(response.ok)return{mode:`ai:${OPENAI_MODEL} + live research`,answer:extractResponseText(await response.json()),sources,checkedAt:new Date().toISOString()};
  }
  const lead=references[0]?.description||papers.find(p=>p.abstract)?.abstract;
  return{mode:'research-brief (AI not configured)',answer:lead?`The fresh search found this useful starting point: ${lead} The evidence set below should be compared before drawing a firm conclusion.`:`The fresh search did not return enough explanatory text to answer responsibly. Review the sources below or narrow the question.`,sources,checkedAt:new Date().toISOString()};
}

async function route(req,res) {
  const url=new URL(req.url,`http://${req.headers.host}`);
  try {
    if(req.method==='GET'&&url.pathname==='/api/status') return json(res,200,{live:true,aiConfigured:Boolean(OPENAI_KEY),aiModel:OPENAI_KEY?OPENAI_MODEL:null,youtubeOfficial:Boolean(YOUTUBE_KEY),researchProviders:['Crossref','Wikipedia','Open Library','GitHub',YOUTUBE_KEY?'YouTube Data API':'YouTube web results']});
    if(req.method==='POST'&&url.pathname==='/api/research') return json(res,200,await researchTopic(await readJson(req)));
    if(req.method==='POST'&&url.pathname==='/api/research/refresh') return json(res,200,await refreshResearch((await readJson(req)).research));
    if(req.method==='POST'&&url.pathname==='/api/course') return json(res,200,await buildCourse(await readJson(req)));
    if(req.method==='POST'&&url.pathname==='/api/grade') return json(res,200,await gradeResponse(await readJson(req)));
    if(req.method==='POST'&&url.pathname==='/api/tutor') return json(res,200,await researchTutor(await readJson(req)));
    if(req.method==='POST'&&url.pathname==='/api/source') return json(res,200,await resolveSource(await readJson(req)));
    if(req.method==='GET'&&url.pathname==='/api/health') return json(res,200,{ok:true,time:new Date().toISOString()});
    const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)); const safe=normalize(relative).replace(/^(\.\.(\/|\\|$))+/,''); const file=join(ROOT,safe);
    if(!file.startsWith(ROOT)) return json(res,403,{error:'Forbidden'});
    const info=await stat(file); if(!info.isFile()) throw new Error('Not found'); const data=await readFile(file); const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream'; res.writeHead(200,{'content-type':type,'cache-control':'no-store'}); res.end(data);
  } catch(error) { json(res,error.message==='Not found'?404:500,{error:error.message}); }
}

http.createServer(route).listen(PORT,'127.0.0.1',()=>console.log(`Materia live at http://127.0.0.1:${PORT}`));
