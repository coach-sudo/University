const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const views=['builder','research','length','course'];
const state={status:null,research:null,course:null,courseRecord:null,materials:[],weeks:12,progress:0,activeSourceFilter:'all',attempts:[],notes:[],watchTimer:null,watchBusy:false,persistence:false};

function showView(id){views.forEach(view=>$(`#${view}`).classList.toggle('hidden',view!==id));window.scrollTo(0,0)}
function toast(message,type='info'){const el=$('#toast');el.textContent=message;el.dataset.type=type;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000)}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function compact(value='',limit=42){value=String(value);return value.length>limit?value.slice(0,limit-1)+'…':value}
function allSources(){if(!state.research)return[];return [...state.research.papers,...state.research.books,...state.research.references,...state.research.videos,...state.research.tools,...state.research.materials.filter(x=>x.text).map((x,i)=>({id:`material:${i}`,kind:'material',title:x.name,description:'Learner-provided source material',quality:'Uploaded material'}))]}

async function api(path,body){
  const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({error:'Invalid server response'}));
  if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);return data;
}

async function persistState(event){
  try{
    const result=await api('/api/prototype-state',event);
    state.persistence=true;
    return result;
  }catch(error){
    state.persistence=false;
    console.debug('Persistence unavailable:',error.message);
    return null;
  }
}

async function loadPersistentState(){
  const saved=await persistState(null);
  if(!saved?.course)return;
  state.courseRecord=saved.course;
  state.course=saved.course.courseGraph;
  state.attempts=(saved.attempts||[]).map(attempt=>({score:attempt.score,feedback:attempt.feedback,dimensions:attempt.dimensions,trace:attempt.trace,submittedAt:attempt.createdAt}));
  state.notes=saved.notes||[];
  $('#noteCount').textContent=state.notes.length;
}

async function loadStatus(){
  try{
    state.status=await api('/api/status');
    const banner=document.createElement('div');banner.className=`system-banner ${state.status.aiConfigured?'connected':'limited'}`;
    banner.innerHTML=`<i></i><div><b>${state.status.aiConfigured?`AI synthesis connected · ${escapeHtml(state.status.aiModel)}`:'Live research connected · AI synthesis not configured'}</b><span>${escapeHtml(state.status.researchProviders.join(' · '))}</span></div><button id="statusDetails">Details</button>`;
    $('#courseForm').prepend(banner);
    banner.querySelector('button').addEventListener('click',()=>toast(state.status.aiConfigured?'Research and AI synthesis are live.':'Research is live. Set OPENAI_API_KEY before starting the server to enable model-written course synthesis.'));
  }catch(error){
    const banner=document.createElement('div');banner.className='system-banner offline';banner.innerHTML='<i></i><div><b>Backend is not running</b><span>Open http://127.0.0.1:4173 — the file:// page cannot perform research.</span></div>';$('#courseForm').prepend(banner);
  }
  await loadPersistentState();
}

$$('.topic-examples button').forEach(button=>button.addEventListener('click',()=>{$('#topic').value=button.textContent;$('#topic').focus()}));

async function readFileForResearch(file){
  const basic={name:file.name,type:file.type||'text/plain'};
  if(file.type==='application/pdf'){const buffer=await file.arrayBuffer();const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return{...basic,base64:btoa(binary)}}
  if(file.type.startsWith('text/')||/\.(md|txt|csv|json|html?)$/i.test(file.name))return{...basic,text:(await file.text()).slice(0,120000)};
  return{...basic,text:'',error:'Unsupported file type. Use PDF, TXT, Markdown, CSV, JSON, or HTML.'};
}

$('#fileInput').addEventListener('change',async event=>{
  const files=[...event.target.files];$('#fileChips').innerHTML=files.map(file=>`<span>Reading ${escapeHtml(file.name)}…</span>`).join('');
  state.materials=await Promise.all(files.slice(0,8).map(readFileForResearch));
  $('#fileChips').innerHTML=state.materials.map(item=>`<span class="${item.error?'file-error':''}">↗ ${escapeHtml(item.name)}${item.error?' · unsupported':''}</span>`).join('');
});

function researchMessage(text){$('#researchStatus').textContent=text}
function updateResearchCounts(){
  const stats=state.research?.stats||{};$('#sourceCount').textContent=(stats.papers||0)+(stats.books||0)+(stats.references||0);$('#disciplineCount').textContent=(stats.videos||0)+(stats.tools||0);$('#researchBar').style.width='100%';
}

$('#courseForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(location.protocol==='file:'){toast('This file view cannot research. Open http://127.0.0.1:4173 instead.','error');return}
  const topic=$('#topic').value.trim();if(!topic)return;
  showView('research');$('#researchBar').style.width='8%';
  const steps=[`Searching scholarly indexes for “${topic}”…`,'Reviewing journal records and academic books…','Finding explanatory videos and practical tools…','Extracting and indexing your uploaded material…'];let step=0;
  const ticker=setInterval(()=>{step=(step+1)%steps.length;researchMessage(steps[step]);$('#researchBar').style.width=`${18+step*17}%`},1100);
  try{
    state.research=await api('/api/research',{topic,lens:$('#lens').value,outcome:$('#outcome').value,style:$('#style').value,materials:state.materials});clearInterval(ticker);updateResearchCounts();
    researchMessage(`Found ${state.research.stats.papers} journal records, ${state.research.stats.books} books, ${state.research.stats.videos} videos, and ${state.research.stats.tools} tools. ${state.research.errors.length?`${state.research.errors.length} provider(s) reported an error.`:'All available providers responded.'}`);
    setTimeout(()=>showView('length'),900);
  }catch(error){clearInterval(ticker);researchMessage(`Research stopped: ${error.message}`);$('#researchBar').style.width='0%';setTimeout(()=>showView('builder'),2200)}
});

$$('.length-card').forEach(card=>card.addEventListener('click',()=>{$$('.length-card').forEach(x=>x.classList.remove('selected'));card.classList.add('selected');state.weeks=Number(card.dataset.weeks)}));
$('#backToBuilder').addEventListener('click',()=>showView('builder'));

$('#buildCourse').addEventListener('click',async()=>{
  if(!state.research){showView('builder');return}
  const button=$('#buildCourse');button.disabled=true;button.querySelector('span').textContent=state.status?.aiConfigured?'Synthesizing with AI…':'Building from source map…';
  try{
    state.course=await api('/api/course',{research:state.research,weeks:state.weeks,answers:{lens:$('#lens').value,outcome:$('#outcome').value,style:$('#style').value}});if(state.course.liveResearch)state.research=state.course.liveResearch;
    const persisted=await persistState({type:'course',course:state.course,research:state.research,weeks:state.weeks});
    state.courseRecord=persisted?.course||null;
    renderCourse();startResearchWatch();showView('course');toast(state.course.notice||`Course built from ${state.course.provenance?.sourceCount||allSources().length} live sources.`);
  }catch(error){toast(`Course generation failed: ${error.message}`,'error')}
  finally{button.disabled=false;button.querySelector('span').textContent='Build my course'}
});

function renderCourse(){
  const course=state.course,research=state.research,lesson=course.lesson;const short=compact(course.title,40);
  $('#courseName').textContent=short;$('#courseSubtitle').textContent=course.subtitle;$('#crumbCourse').textContent=short.toUpperCase();
  $('#moduleNav').innerHTML=course.modules.map((module,mi)=>`<div class="module ${mi===0?'active':''}"><button class="module-head" data-module="${mi}"><span>${String(mi+1).padStart(2,'0')}</span><b>${escapeHtml(module.title)}</b><em>${mi===0?'−':'+'}</em></button><div class="lessons">${module.lessons.map((title,li)=>`<button class="lesson-link ${mi===0&&li===0?'current':''}" data-mi="${mi}" data-li="${li}">${li+1}. ${escapeHtml(title)}</button>`).join('')}</div></div>`).join('');
  $$('.module-head').forEach(button=>button.addEventListener('click',()=>{const module=button.parentElement;module.classList.toggle('active');button.querySelector('em').textContent=module.classList.contains('active')?'−':'+'}));
  $$('.lesson-link').forEach(button=>button.addEventListener('click',()=>selectLesson(button)));
  $('#lessonCode').textContent='1.1';$('#lessonTitle').textContent=lesson.title;$('#lessonDek').textContent=lesson.dek;$('#chapterTitle').innerHTML=`The working map of <em>${escapeHtml(course.title)}</em>`;$('#chapterIntro').textContent=lesson.summary;$('#sectionBody').textContent=`This course begins with a source map rather than a single textbook. You will compare scholarly research, books, public explanations, tools, and your own material—then track which evidence supports each conclusion.`;
  $('#connectionPrompt').textContent=`Where have you already encountered ${course.title} in practice, work, culture, or daily life?`;
  $('#discussionPrompt').textContent=lesson.questions?.[1]||`Which assumption in ${course.title} most deserves scrutiny?`;$('#practiceTitle').textContent=`Test a claim about ${course.title}`;$('#practiceIntro').textContent=`Choose one claim from this lesson. Test it against a real case and at least two sources, then document where the claim holds and where it breaks.`;
  $('.evidence-strip p').textContent=`Researched ${new Date(research.queriedAt).toLocaleString()} · ${lesson.readings.length} sources assigned`;
  const audit=course.researchAudit;$('#researchWatchText').textContent=audit?`Checked during ${audit.stage}: ${audit.currentCount} current sources · ${audit.newSources.length} new · ${audit.removedSources.length} changed or removed.`:'Generation, grading, and tutoring each trigger a fresh evidence check.';
  renderVideo(lesson.video);renderReadings(lesson.readings);renderConceptMap(course.modules);renderEvidenceChart(research.papers);renderTools(lesson.tools);renderSourceLibrary();
  $('#sourceTotal').textContent=allSources().length;$('#drawerCount').textContent=allSources().length;
  $('#coachFeedback').textContent=course.notice||`Your assessment will be graded against ${course.assessment.rubric.length} transparent criteria and the actual course evidence.`;
  $('#draftInput').placeholder=course.assessment.prompt;
}

function selectLesson(button){
  $$('.lesson-link').forEach(x=>x.classList.remove('current'));button.classList.add('current');const mi=Number(button.dataset.mi),li=Number(button.dataset.li),module=state.course.modules[mi];
  $('#crumbModule').textContent=module.title.toUpperCase();$('#lessonCode').textContent=`${mi+1}.${li+1}`;$('#lessonTitle').textContent=module.lessons[li];$('#lessonDek').textContent=module.purpose;$$('.lesson-tabs button')[0].click();if(innerWidth<901)$('.course-sidebar').classList.remove('open');
}

function renderVideo(video){
  const visual=$('.video-visual');
  if(!video){visual.innerHTML='<div class="media-unavailable"><b>No verified embed found</b><span>Add a YouTube API key or choose a source manually.</span></div>';$('#videoTitle').textContent='Video source unavailable';$('#videoDescription').textContent='The course remains usable through readings, maps, tools, and activities.';return}
  visual.innerHTML=`<iframe src="${escapeHtml(video.embed)}" title="${escapeHtml(video.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  $('#videoTitle').textContent=video.title;$('#videoDescription').textContent=`${video.channel} · ${video.provider}. Review the source and channel before including it in the permanent course.`;
}

function renderReadings(readings){
  $('#read').innerHTML=`<div class="resource-list"><h2>Evidence for this lesson</h2><p>Every item links to the source record. Remove or replace sources from the library at any time.</p>${readings.map((source,index)=>`<article><span>${String(index+1).padStart(2,'0')}</span><div><b>${escapeHtml(source.title)}</b><p>${escapeHtml((source.authors||[]).join(', ')||source.venue||source.quality||'Source')} · ${escapeHtml(source.year||'n.d.')}${source.citations!=null?` · ${source.citations} Crossref citations`:''}</p></div><em>${escapeHtml(source.quality||source.kind)}</em><a href="${escapeHtml(source.url||'#')}" target="_blank" rel="noreferrer">Open ↗</a></article>`).join('')}</div>`;
}

function renderTools(tools){
  $('#toolShelf')?.remove();const shelf=document.createElement('section');shelf.id='toolShelf';shelf.className='tool-shelf';shelf.innerHTML=`<div><span>REAL-WORLD TOOLKIT</span><h3>Tools worth opening</h3><p>Live results from GitHub, ranked by stars. Inspect licenses and maintenance before relying on a project.</p></div><div>${tools.length?tools.map(tool=>`<a href="${escapeHtml(tool.url)}" target="_blank" rel="noreferrer"><b>${escapeHtml(tool.title)}</b><span>${escapeHtml(tool.description)}</span><small>${tool.language||'Mixed'} · ★ ${Number(tool.stars||0).toLocaleString()}</small></a>`).join(''):'<p>No relevant tools were returned for this topic.</p>'}</div>`;$('.concept-map').after(shelf);
}

function renderConceptMap(modules){
  $$('.map-canvas .node').forEach((node,index)=>{node.textContent=compact(modules[index]?.title||node.textContent,15);node.onclick=()=>toast(modules[index]?.purpose||'Concept opened')});
}

function startResearchWatch(){
  clearInterval(state.watchTimer);state.watchTimer=setInterval(()=>{if(!document.hidden&&state.course)refreshResearch('scheduled')},300000);
}

async function refreshResearch(reason='manual'){
  if(state.watchBusy||!state.research)return;state.watchBusy=true;const button=$('#refreshResearch');button.disabled=true;button.textContent='Checking…';$('#researchWatch').classList.add('checking');
  try{const result=await api('/api/research/refresh',{research:state.research});state.research=result.research;const delta=result.delta;$('#researchWatchText').textContent=`${reason==='scheduled'?'Scheduled':'Manual'} check ${new Date(delta.checkedAt).toLocaleTimeString()}: ${delta.newSources.length} new · ${delta.removedSources.length} changed or removed · ${delta.currentCount} current.`;renderSourceLibrary();renderEvidenceChart(state.research.papers);$('#sourceTotal').textContent=allSources().length;$('#drawerCount').textContent=allSources().length;if(delta.newSources.length)toast(`${delta.newSources.length} new research result(s) found. Rebuild affected lessons when ready.`);else toast('Research watch: no source-map changes found.')}
  catch(error){$('#researchWatchText').textContent=`Research check failed: ${error.message}`;toast('Research watch could not reach one or more providers.','error')}
  finally{state.watchBusy=false;button.disabled=false;button.textContent='Check now';$('#researchWatch').classList.remove('checking')}
}
$('#refreshResearch').addEventListener('click',()=>refreshResearch('manual'));

function renderEvidenceChart(papers){
  $('#evidenceChart')?.remove();const ranked=[...papers].sort((a,b)=>(b.citations||0)-(a.citations||0)).slice(0,6),max=Math.max(1,...ranked.map(x=>x.citations||0));const chart=document.createElement('section');chart.id='evidenceChart';chart.className='evidence-chart';
  chart.innerHTML=`<div><span>DATA-DRIVEN GRAPHIC</span><h3>Evidence landscape</h3><p>Crossref citation counts show influence, not truth. Use them to orient—not to outsource judgment.</p></div><div class="citation-bars">${ranked.map(paper=>`<a href="${escapeHtml(paper.url)}" target="_blank" rel="noreferrer"><small>${escapeHtml(paper.year||'n.d.')}</small><b title="${escapeHtml(paper.title)}">${escapeHtml(compact(paper.title,44))}</b><i><em style="width:${Math.max(3,Math.round((paper.citations||0)/max*100))}%"></em></i><strong>${paper.citations||0}</strong></a>`).join('')}</div>`;$('.concept-map').after(chart);
}

function sourceKindLabel(source){return({paper:'Journal',book:'Book',reference:'Reference',video:'Video',tool:'Tool',material:'Your material'})[source.kind]||source.kind}
function renderSourceLibrary(){
  let sources=allSources();if(state.activeSourceFilter==='peer')sources=sources.filter(x=>x.kind==='paper');if(state.activeSourceFilter==='publication')sources=sources.filter(x=>['book','reference','video'].includes(x.kind));
  $('#allCount').textContent=allSources().length;$('#sourceList').innerHTML=sources.map((source,index)=>`<article class="source-item" data-id="${escapeHtml(source.id||String(index))}"><div class="source-rank">${source.citations!=null?Math.min(99,Math.round(Math.log10(source.citations+1)*25)):source.kind==='material'?'YOU':'✓'}</div><div><h3>${escapeHtml(source.title||source.name)}</h3><p>${escapeHtml((source.authors||[]).slice(0,3).join(', ')||source.channel||source.venue||source.description||'')}</p><div class="source-tags"><span class="${source.kind==='paper'?'peer':''}">${sourceKindLabel(source)}</span><span>${escapeHtml(source.quality||'Live result')}</span></div></div><div class="source-actions">${source.url?`<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Inspect</a>`:''}<button class="remove" data-id="${escapeHtml(source.id||String(index))}">Remove</button></div></article>`).join('');
  $$('.source-item .remove').forEach(button=>button.addEventListener('click',()=>removeSource(button.dataset.id)));
}

function removeSource(id){
  for(const key of ['papers','books','references','videos','tools']){const index=state.research[key].findIndex(x=>String(x.id)===String(id));if(index>=0){state.research[key].splice(index,1);break}}
  renderSourceLibrary();$('#sourceTotal').textContent=allSources().length;$('#drawerCount').textContent=allSources().length;$('#syncTitle').textContent='Course evidence changed';$('#syncText').textContent='Rebuild the course to regenerate affected lessons from the revised source map.';toast('Source removed. Rebuild to resynthesize affected lessons.');
}

function openSources(){renderSourceLibrary();$('#sourceModal').classList.remove('hidden');document.body.style.overflow='hidden'}
function closeSources(){$('#sourceModal').classList.add('hidden');document.body.style.overflow=''}
$('#sourcesBtn').addEventListener('click',openSources);$('#lessonSourcesBtn').addEventListener('click',openSources);$('#searchBtn').addEventListener('click',openSources);$('#closeSources').addEventListener('click',closeSources);$('#sourceBackdrop').addEventListener('click',closeSources);$('#doneSources').addEventListener('click',closeSources);
$('#methodBtn').addEventListener('click',()=>$('#methodology').classList.toggle('hidden'));
$$('.source-filter').forEach(button=>button.addEventListener('click',()=>{$$('.source-filter').forEach(x=>x.classList.remove('active'));button.classList.add('active');state.activeSourceFilter=button.dataset.filter;renderSourceLibrary()}));
$('#addSourceForm').addEventListener('submit',async event=>{
  event.preventDefault();const input=$('#sourceInput'),button=event.currentTarget.querySelector('button'),value=input.value.trim();if(!value)return;button.disabled=true;button.textContent='Resolving…';
  try{const source=await api('/api/source',{query:value});const bucket=source.kind==='paper'?'papers':source.kind==='video'?'videos':'references';state.research[bucket].unshift(source);input.value='';renderSourceLibrary();$('#sourceTotal').textContent=allSources().length;$('#drawerCount').textContent=allSources().length;$('#syncTitle').textContent='Verified record added';$('#syncText').textContent='Rebuild the course to resynthesize lessons and assignments with this source.';toast(`Added: ${source.title}`)}catch(error){toast(`Could not resolve source: ${error.message}`,'error')}finally{button.disabled=false;button.textContent='+ Add for verification'}
});

$$('.lesson-tabs button').forEach(button=>button.addEventListener('click',()=>{$$('.lesson-tabs button').forEach(x=>x.classList.remove('active'));$$('.tab-panel').forEach(x=>x.classList.remove('active'));button.classList.add('active');$(`#${button.dataset.tab}`).classList.add('active')}));
$('#feedbackBtn').addEventListener('click',()=>{$('.lesson-tabs button[data-tab="feedback"]').click();window.scrollTo({top:0,behavior:'smooth'});if(innerWidth<901)$('.course-sidebar').classList.remove('open')});

$$('.mode-picker button').forEach(button=>button.addEventListener('click',()=>{
  $$('.mode-picker button').forEach(x=>x.classList.remove('active'));button.classList.add('active');const mode=button.dataset.mode;
  if(mode==='watch')$('.video-card').scrollIntoView({behavior:'smooth'});
  if(mode==='listen'&&state.course){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(`${state.course.lesson.title}. ${state.course.lesson.summary}`));toast('Listening mode started with your device voice.')}
  if(mode==='map')$('.concept-map').scrollIntoView({behavior:'smooth'});if(mode==='readmode')$('.textbook').scrollIntoView({behavior:'smooth'});
}));

$$('.answers button').forEach(button=>button.addEventListener('click',()=>{$$('.answers button').forEach(x=>x.classList.remove('correct','wrong'));const correct=button.dataset.correct==='true';button.classList.add(correct?'correct':'wrong');$('#answerFeedback').textContent=correct?'Correct. A useful model can be tested, explained, and revised. +20 XP':'Try again. Look for the answer that treats knowledge as a model you can test and revise.'}));

$('#evaluateDraft').addEventListener('click',async()=>{
  const response=$('#draftInput').value.trim();if(response.length<40){toast('Write at least a few sentences so the feedback can examine your reasoning.');return}
  const button=$('#evaluateDraft');button.disabled=true;button.firstChild.textContent='Evaluating evidence… ';
  try{
    const result=await api('/api/grade',{topic:state.research.topic,response,sources:state.course.lesson.readings,previousScores:state.attempts.map(x=>x.score)});state.attempts.push({...result,response,submittedAt:new Date().toISOString()});$('#masteryScore').textContent=result.score;
    await persistState({type:'attempt',courseId:state.courseRecord?.id,prompt:state.course.assessment.prompt,response,result});
    const map=[['accuracy',result.dimensions.conceptualAccuracy],['evidence',result.dimensions.evidenceUse],['transfer',result.dimensions.transfer]];map.forEach(([id,score])=>{$(`#${id}Bar`).style.setProperty('--score',score+'%');$(`#${id}Label`).textContent=score>=88?'Excellent':score>=75?'Strong':score>=60?'Developing':'Needs revision'});
    const fresh=result.researchCheck?.newEvidence||[];$('#coachFeedback').innerHTML=`${escapeHtml(result.feedback)} <small>Trace: ${result.trace.evidenceMarkers} evidence markers, ${result.trace.reasoningMarkers} reasoning markers, ${result.trace.matchedSources} named source matches. Research rechecked ${new Date(result.researchCheck.checkedAt).toLocaleTimeString()} across ${result.researchCheck.papersChecked} records.</small>${fresh.length?`<span class="fresh-evidence">Fresh evidence to consider: ${fresh.map(source=>`<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a>`).join('')}</span>`:''}`;$('#researchWatchText').textContent=`Grading check ${new Date(result.researchCheck.checkedAt).toLocaleTimeString()}: ${result.researchCheck.papersChecked} papers checked · ${fresh.length} potentially new.`;toast(`Assessment complete · ${result.score}% · research refreshed`);
  }catch(error){toast(`Assessment failed: ${error.message}`,'error')}finally{button.disabled=false;button.firstChild.textContent='Evaluate my thinking '}
});

$('#revisionBtn').addEventListener('click',()=>{$('#draftInput').focus();toast('Revision mode: strengthen the claim, evidence, counterargument, and change-your-mind condition.')} );
$('#askTutor').addEventListener('click',async()=>{
  const question=$('#tutorQuestion').value.trim();if(question.length<8){toast('Ask a little more specifically so the tutor can research it.');return}const button=$('#askTutor');button.disabled=true;button.firstChild.textContent='Researching… ';
  try{const result=await api('/api/tutor',{topic:state.research.topic,question,course:state.course});await persistState({type:'tutor',courseId:state.courseRecord?.id,question,result});const panel=$('#tutorAnswer');panel.classList.remove('hidden');panel.innerHTML=`<b>${escapeHtml(result.mode)}</b><p>${escapeHtml(result.answer)}</p><span>Checked ${new Date(result.checkedAt).toLocaleString()}</span><div>${result.sources.slice(0,6).map(source=>`<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a>`).join('')}</div>`;$('#researchWatchText').textContent=`Tutor research checked ${result.sources.length} current sources at ${new Date(result.checkedAt).toLocaleTimeString()}.`;toast(`Tutor researched ${result.sources.length} sources before answering.`)}catch(error){toast(`Tutor research failed: ${error.message}`,'error')}finally{button.disabled=false;button.firstChild.textContent='Research & answer '}
});
$('#completeLesson').addEventListener('click',()=>{state.progress=Math.min(100,state.progress+7);$('#progressFill').style.width=state.progress+'%';$('#percentLabel').textContent=state.progress+'%';toast('Lesson complete · progress saved for this session')});
$('#addNote').addEventListener('click',async()=>{const note=prompt('Add a course note:');if(note){const saved=await persistState({type:'note',courseId:state.courseRecord?.id,topic:state.research?.topic||state.course?.title||'Untitled topic',note});state.notes.push(saved?.note||{topic:state.research?.topic,note,createdAt:new Date().toISOString()});$('#noteCount').textContent=state.notes.length;toast(state.persistence?'Note saved to the learner record.':'Note kept for this session; persistence API unavailable.')}});
$('#notesBtn').addEventListener('click',()=>toast(`${state.notes.length} note(s) in the learner record.`));
$('#glossaryBtn').addEventListener('click',()=>toast('Glossary is built from the current source map after course generation.'));
$('#mobileMenu').addEventListener('click',()=>$('.course-sidebar').classList.toggle('open'));
$('.grading-trace')?.addEventListener('click',event=>{if(event.target.tagName!=='BUTTON')return;if(event.target.textContent.includes('revision'))toast(`${state.attempts.length} graded attempt(s) in this session${state.attempts.length>1?` · change ${state.attempts.at(-1).score-state.attempts.at(-2).score>=0?'+':''}${state.attempts.at(-1).score-state.attempts.at(-2).score} points`:''}.`);else toast(`${event.target.textContent}: grading traces combine the submitted response, named course sources, and a fresh Crossref query.`)});

loadStatus();
