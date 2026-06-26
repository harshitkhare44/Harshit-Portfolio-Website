/* ===================================================================
   ApplyFlow — job tracker (localStorage, no backend)
   Dashboard table · cards · insights · resume match · alerts ·
   export/import · PDF parsing · daily reminders · theme
   =================================================================== */

const STORE_KEY = 'applyflow.jobs.v1';
const SET_KEY   = 'applyflow.settings.v1';
const WARN_DAYS = 7;   // amber threshold (soon threshold is configurable)

const STATUS = {
  'not-applied':    { label: 'Not applied',        color: '#c3cbe6' },
  'applied':        { label: 'Applied',            color: '#56b4ff' },
  'mailed-referral':{ label: 'Mailed for referral',color: '#ffb454' },
  'got-referral':   { label: 'Got referral',       color: '#37d399' },
};
const STATUS_ORDER = ['not-applied','applied','mailed-referral','got-referral'];

/* ---------- settings ---------- */
const defaultSettings = { theme:'dark', reminderEnabled:false, reminderTime:'10:00', soonDays:3, lastReminder:'' };
let settings = loadSettings();
function loadSettings(){
  try { return Object.assign({}, defaultSettings, JSON.parse(localStorage.getItem(SET_KEY))||{}); }
  catch { return {...defaultSettings}; }
}
function saveSettings(){ localStorage.setItem(SET_KEY, JSON.stringify(settings)); }

/* ---------- data ---------- */
let jobs = load();
let layout = 'table';                                  // table | board | cards
let sortState = { key:'expiry', dir:'asc' };
let dragId = null;

// backfill fields added in later versions
jobs.forEach((j,i)=>{
  if(j.order==null) j.order = j.createdAt || i;
  if(j.interviewDate===undefined) j.interviewDate = '';
  if(j.followUpDate===undefined) j.followUpDate = '';
});

function load(){
  try { const v=JSON.parse(localStorage.getItem(STORE_KEY)); return Array.isArray(v)?v:seedIfEmpty(); }
  catch { return []; }
}
function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(jobs)); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function seedIfEmpty(){
  const t=new Date(), d=(o)=>iso(addDays(t,o));
  const demo=[
    { id:uid(), role:'Frontend Engineer', company:'Acme Inc.', link:'https://example.com/job1',
      status:'applied', mailed:2, gotReferral:0, posted:d(-6), expiry:d(2),
      interviewDate:d(3), followUpDate:d(1), appliedDate:d(-1), order:1,
      notes:'Used referral from LinkedIn.', createdAt:Date.now()-86400000 },
    { id:uid(), role:'Full Stack Developer', company:'Globex', link:'https://example.com/job2',
      status:'mailed-referral', mailed:3, gotReferral:0, posted:d(-3), expiry:d(5),
      interviewDate:'', followUpDate:d(2), appliedDate:null, order:2,
      notes:'Waiting on referral reply.', createdAt:Date.now()-43200000 },
    { id:uid(), role:'React Developer', company:'Initech', link:'https://example.com/job3',
      status:'not-applied', mailed:0, gotReferral:0, posted:d(-1), expiry:d(1),
      interviewDate:'', followUpDate:'', appliedDate:null, order:3,
      notes:'', createdAt:Date.now()-3600000 },
  ];
  localStorage.setItem(STORE_KEY, JSON.stringify(demo));
  return demo;
}

/* ---------- dates ---------- */
function iso(dt){ return dt.toISOString().slice(0,10); }
function addDays(dt,n){ const x=new Date(dt); x.setDate(x.getDate()+n); return x; }
function today0(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function daysUntil(dstr){ if(!dstr) return null; const e=new Date(dstr); e.setHours(0,0,0,0); return Math.round((e-today0())/86400000); }
function fmtDate(dstr){ if(!dstr) return '—'; return new Date(dstr).toLocaleDateString(undefined,{day:'numeric',month:'short'}); }

/* ===================================================================
   ROUTING
   =================================================================== */
function setView(name){
  document.querySelectorAll('.view').forEach(v=> v.hidden = (v.id !== 'view-'+name));
  document.querySelectorAll('.nav-btn').forEach(b=> b.classList.toggle('active', b.dataset.view===name));
  document.querySelectorAll('.bottom-nav button').forEach(b=> b.classList.toggle('active', b.dataset.view===name));
  if(name==='insights') renderInsights();
  if(name==='alerts') renderAlerts();
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-view]').forEach(b=> b.addEventListener('click', ()=> setView(b.dataset.view)));

/* ===================================================================
   EXPIRY / FILTER / SORT
   =================================================================== */
function expiryInfo(job){
  const du = daysUntil(job.expiry);
  const actioned = job.status==='applied' || job.status==='got-referral';
  if(du===null) return { cls:'ok', text:'No expiry', urgent:false, du:9999 };
  if(du < 0)  return { cls:'soon', text:'Expired', urgent:!actioned, du };
  if(du===0)  return { cls:'soon', text:'Today', urgent:!actioned, du };
  if(du <= settings.soonDays) return { cls:'soon', text:`${du}d left`, urgent:!actioned, du };
  if(du <= WARN_DAYS)        return { cls:'warn', text:`${du}d left`, urgent:false, du };
  return { cls:'ok', text:`${du}d left`, urgent:false, du };
}

function filteredJobs(){
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const sf = document.getElementById('statusFilter').value;
  let arr = jobs.filter(j=>{
    const hay = (j.role+' '+j.company+' '+(j.notes||'')).toLowerCase();
    return (!q || hay.includes(q)) && (sf==='all' || j.status===sf);
  });
  const {key,dir} = sortState, m = dir==='asc'?1:-1, big=9e15;
  const val = {
    idx:    j=> j.createdAt,
    role:   j=> (j.role||'').toLowerCase(),
    company:j=> (j.company||'').toLowerCase(),
    status: j=> STATUS_ORDER.indexOf(j.status),
    link:   j=> j.link?0:1,
    mailed: j=> +j.mailed||0,
    referral:j=> j.gotReferral?1:0,
    posted: j=> j.posted? new Date(j.posted).getTime():0,
    expiry: j=> j.expiry? new Date(j.expiry).getTime():big,
    interview: j=> j.interviewDate? new Date(j.interviewDate).getTime():big,
  }[key] || (j=>j.createdAt);
  arr.sort((a,b)=>{ const x=val(a),y=val(b); return (x<y?-1:x>y?1:0)*m; });
  return arr;
}

/* ===================================================================
   DASHBOARD (table + cards)
   =================================================================== */
function renderDashboard(){
  const arr = filteredJobs();
  const empty = arr.length===0;
  document.getElementById('emptyState').hidden = !empty;
  document.getElementById('tableWrap').hidden = layout!=='table' || empty;
  document.getElementById('kanban').hidden    = layout!=='board' || empty;
  document.getElementById('jobList').hidden    = layout!=='cards' || empty;
  if(layout==='table') renderTable(arr);
  else if(layout==='board') renderBoard(arr);
  else renderCards(arr);
  renderStats();
  renderSortHeaders();
  refreshAlertBadge();
}

// small date pill; adds "due" styling when within `window` days (or overdue)
function dateTag(dstr, cls, icon, win){
  if(!dstr) return '';
  const d = daysUntil(dstr);
  const due = d!=null && d<=win;
  return `<span class="dtag ${cls} ${due?'due':''}">${icon} ${fmtDate(dstr)}</span>`;
}

function renderTable(arr){
  const body = document.getElementById('tableBody');
  body.innerHTML = arr.map((j,i)=>{
    const ex = expiryInfo(j);
    const opts = STATUS_ORDER.map(s=>`<option value="${s}" ${s===j.status?'selected':''}>${STATUS[s].label}</option>`).join('');
    return `<tr class="${ex.urgent?'urgent':''}">
      <td class="num td-idx">${i+1}</td>
      <td><div class="td-role">${esc(j.role)}</div></td>
      <td class="td-company">${esc(j.company)}</td>
      <td><select class="status-select ${j.status}" data-status="${j.id}">${opts}</select></td>
      <td>${j.link?`<a class="t-link" href="${esc(j.link)}" target="_blank" rel="noopener">Open ↗</a>`:'<span class="ref-no">—</span>'}</td>
      <td class="num">${j.mailed||0}</td>
      <td class="num">${(j.gotReferral||j.status==='got-referral')?'<span class="ref-yes">Yes 🤝</span>':'<span class="ref-no">No</span>'}</td>
      <td>${fmtDate(j.posted)}</td>
      <td><span class="expiry-tag ${ex.cls}">${ex.text}</span></td>
      <td>${j.interviewDate?dateTag(j.interviewDate,'interview','📅',2):'<span class="ref-no">—</span>'}</td>
      <td class="td-notes">${j.notes?`<span class="clip" title="${esc(j.notes)}">${esc(j.notes)}</span>`:'<span class="ref-no">—</span>'}</td>
      <td class="num"><div class="t-actions">
        <button class="t-act" data-edit="${j.id}" title="Edit">✏️</button>
        <button class="t-act del" data-del="${j.id}" title="Delete">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openModal(b.dataset.edit)));
  body.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=> quickDelete(b.dataset.del)));
  body.querySelectorAll('[data-status]').forEach(s=> s.addEventListener('change', ()=> quickStatus(s.dataset.status, s.value)));
}

function renderCards(arr){
  document.getElementById('jobList').innerHTML = arr.map(jobCard).join('');
  document.querySelectorAll('#jobList [data-edit]').forEach(b=> b.addEventListener('click', ()=> openModal(b.dataset.edit)));
}
function jobCard(j){
  const st=STATUS[j.status], ex=expiryInfo(j);
  return `<article class="job ${ex.urgent?'urgent':''}">
    <div class="job-top">
      <div><div class="job-role">${esc(j.role)}</div><div class="job-company">🏢 ${esc(j.company)}</div></div>
      <button class="job-edit" data-edit="${j.id}">Edit</button>
    </div>
    <span class="pill ${j.status}">${st.label}</span>
    <div class="job-meta">
      <span>📅 Posted <b>${fmtDate(j.posted)}</b></span>
      <span>⌛ <span class="expiry-tag ${ex.cls}">${ex.text}</span></span>
    </div>
    ${(j.interviewDate||j.followUpDate)?`<div class="kc-tags">${dateTag(j.interviewDate,'interview','📅 Interview',2)}${dateTag(j.followUpDate,'followup','📨 Follow-up',1)}</div>`:''}
    ${j.notes?`<div class="job-meta"><span>📝 ${esc(j.notes)}</span></div>`:''}
    <div class="job-foot">
      ${j.link?`<a class="job-link" href="${esc(j.link)}" target="_blank" rel="noopener">Open posting ↗</a>`:`<span style="color:var(--muted-2);font-size:13px">No link</span>`}
      <span class="referrals">✉️ ${j.mailed||0} mailed${j.gotReferral?' · 🤝':''}</span>
    </div>
  </article>`;
}

/* ---------- Kanban board + drag-and-drop ---------- */
function renderBoard(arr){
  const k=document.getElementById('kanban');
  k.innerHTML = STATUS_ORDER.map(s=>{
    const items = arr.filter(j=>j.status===s).sort((a,b)=>(a.order||0)-(b.order||0));
    return `<div class="kcol" data-col="${s}">
      <div class="kcol-head">
        <span class="kc-title"><span class="kcol-dot" style="background:${STATUS[s].color}"></span>${STATUS[s].label}</span>
        <span class="kc-count">${items.length}</span>
      </div>
      <div class="kcards" data-drop="${s}">
        ${items.map(boardCard).join('') || '<div class="kc-empty">Drop a card here</div>'}
      </div>
    </div>`;
  }).join('');
  attachBoardDnd();
}
function boardCard(j){
  const ex=expiryInfo(j);
  const tags=[];
  if(j.expiry) tags.push(`<span class="dtag ${ex.cls==='soon'?'due':''}">⌛ ${ex.text}</span>`);
  if(j.mailed) tags.push(`<span class="dtag">✉️ ${j.mailed}</span>`);
  tags.push(dateTag(j.interviewDate,'interview','📅',2));
  tags.push(dateTag(j.followUpDate,'followup','📨',1));
  return `<div class="kcard" draggable="true" data-id="${j.id}" style="--accent:${STATUS[j.status].color}">
    <div class="kc-role">${esc(j.role)}</div>
    <div class="kc-company">🏢 ${esc(j.company)}</div>
    <div class="kc-tags">${tags.join('')}</div>
    <div class="kc-actions">
      <button data-edit="${j.id}">Edit</button>
      ${j.link?`<button data-open="${esc(j.link)}">Open ↗</button>`:''}
    </div>
  </div>`;
}
function attachBoardDnd(){
  const k=document.getElementById('kanban');
  k.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', e=>{ e.stopPropagation(); openModal(b.dataset.edit); }));
  k.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', e=>{ e.stopPropagation(); window.open(b.dataset.open,'_blank','noopener'); }));
  k.querySelectorAll('.kcard').forEach(card=>{
    card.addEventListener('dragstart', e=>{ dragId=card.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    card.addEventListener('dragend', ()=>{ dragId=null; card.classList.remove('dragging'); k.querySelectorAll('.kcol').forEach(c=>c.classList.remove('drag-over')); });
  });
  k.querySelectorAll('.kcards').forEach(zone=>{
    const col=zone.closest('.kcol');
    zone.addEventListener('dragover', e=>{
      e.preventDefault();
      col.classList.add('drag-over');
      const dragging=k.querySelector('.kcard.dragging'); if(!dragging) return;
      const after=getDragAfter(zone, e.clientY);
      if(after==null) zone.appendChild(dragging); else zone.insertBefore(dragging, after);
    });
    zone.addEventListener('dragleave', e=>{ if(!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
    zone.addEventListener('drop', e=>{ e.preventDefault(); col.classList.remove('drag-over'); commitDrop(zone); });
  });
}
function getDragAfter(zone,y){
  const els=[...zone.querySelectorAll('.kcard:not(.dragging)')];
  return els.reduce((closest,child)=>{
    const box=child.getBoundingClientRect();
    const offset=y-box.top-box.height/2;
    return (offset<0 && offset>closest.offset) ? {offset,element:child} : closest;
  }, {offset:-Infinity, element:null}).element;
}
function commitDrop(zone){
  if(!dragId) return;
  const newStatus=zone.dataset.drop;
  const j=jobs.find(x=>x.id===dragId); if(!j) return;
  const oldStatus=j.status;
  if(newStatus!==oldStatus){
    const actioned=newStatus==='applied'||newStatus==='got-referral';
    const wasActioned=oldStatus==='applied'||oldStatus==='got-referral';
    j.status=newStatus;
    if(newStatus==='got-referral') j.gotReferral=1;
    if(actioned && !j.appliedDate) j.appliedDate=iso(new Date());
    if(!actioned && !wasActioned) j.appliedDate=null;
  }
  // persist the new within-column order from the live DOM sequence
  [...zone.querySelectorAll('.kcard')].forEach((c,i)=>{ const job=jobs.find(x=>x.id===c.dataset.id); if(job) job.order=i; });
  save(); renderDashboard();
  if(newStatus!==oldStatus) toast('Moved to '+STATUS[newStatus].label);
}

function renderSortHeaders(){
  document.querySelectorAll('#tableHead th[data-sort]').forEach(th=>{
    const k=th.dataset.sort;
    th.classList.toggle('sorted', k===sortState.key);
    const base=th.textContent.replace(/[⬍▲▼]/g,'').trim();
    th.innerHTML = base + (k===sortState.key ? (sortState.dir==='asc'?' ▲':' ▼') : (th.dataset.sort==='link'||th.textContent.includes('Notes')||th.dataset.sort==='referral'?'':' ⬍'));
  });
}
document.getElementById('tableHead').addEventListener('click', e=>{
  const th=e.target.closest('th[data-sort]'); if(!th) return;
  const k=th.dataset.sort;
  if(sortState.key===k) sortState.dir = sortState.dir==='asc'?'desc':'asc';
  else sortState={ key:k, dir:(['mailed','referral','posted','expiry'].includes(k)?'desc':'asc') };
  renderDashboard();
});

/* quick inline edits */
function quickStatus(id,val){
  const j=jobs.find(x=>x.id===id); if(!j) return;
  const actioned = val==='applied'||val==='got-referral';
  const wasActioned = j.status==='applied'||j.status==='got-referral';
  j.status=val;
  if(val==='got-referral') j.gotReferral=1;
  if(actioned && !j.appliedDate) j.appliedDate=iso(new Date());
  if(!actioned && !wasActioned) j.appliedDate=null;
  save(); renderDashboard(); toast('Status updated ✓');
}
function quickDelete(id){
  const j=jobs.find(x=>x.id===id);
  if(j && confirm(`Delete "${j.role} — ${j.company}"?`)){ jobs=jobs.filter(x=>x.id!==id); save(); renderDashboard(); toast('Job deleted'); }
}

/* ---------- stat cards ---------- */
function renderStats(){
  const total=jobs.length;
  const applied=jobs.filter(j=>j.status==='applied'||j.status==='got-referral').length;
  const mailed=jobs.reduce((s,j)=>s+(+j.mailed||0),0);
  const refs=jobs.filter(j=>j.gotReferral||j.status==='got-referral').length;
  const urgent=jobs.filter(j=>expiryInfo(j).urgent).length;
  const todayN=jobs.filter(j=>j.appliedDate===iso(new Date())).length;
  document.getElementById('statGrid').innerHTML=[
    statCard('Total jobs',total,'tracked','🗂️','#6d8bff'),
    statCard('Applied',applied,`${pct(applied,total)}% of total`,'✅','#56b4ff'),
    statCard('Applied today',todayN,'keep the streak','🔥','#37d399'),
    statCard('People mailed',mailed,'for referrals','✉️','#ffb454'),
    statCard('Referrals got',refs,'nice!','🤝','#a06bff'),
    statCard('Expiring soon',urgent,'need action','⏰','#ff6b81'),
  ].join('');
}
function statCard(label,num,sub,ico,accent){
  return `<div class="stat" style="--accent:${accent}">
    <div class="s-top"><span>${label}</span><span class="s-ico">${ico}</span></div>
    <div class="s-num">${num}</div><div class="s-sub">${sub}</div></div>`;
}

/* view toggle */
document.querySelectorAll('.vt-btn').forEach(b=> b.addEventListener('click', ()=>{
  layout=b.dataset.layout;
  document.querySelectorAll('.vt-btn').forEach(x=>x.classList.toggle('active', x===b));
  renderDashboard();
}));

/* ===================================================================
   MODAL (add / edit)
   =================================================================== */
const overlay=document.getElementById('modalOverlay');
const form=document.getElementById('jobForm');
function openModal(id){
  form.reset();
  const del=document.getElementById('deleteJobBtn');
  if(id){
    const j=jobs.find(x=>x.id===id);
    document.getElementById('modalTitle').textContent='Edit job';
    document.getElementById('jobId').value=j.id;
    document.getElementById('f_role').value=j.role;
    document.getElementById('f_company').value=j.company;
    document.getElementById('f_status').value=j.status;
    document.getElementById('f_link').value=j.link||'';
    document.getElementById('f_mailed').value=j.mailed||0;
    document.getElementById('f_gotref').value=j.gotReferral?1:0;
    document.getElementById('f_posted').value=j.posted||'';
    document.getElementById('f_expiry').value=j.expiry||'';
    document.getElementById('f_interview').value=j.interviewDate||'';
    document.getElementById('f_followup').value=j.followUpDate||'';
    document.getElementById('f_notes').value=j.notes||'';
    del.hidden=false;
  } else {
    document.getElementById('modalTitle').textContent='Add job';
    document.getElementById('jobId').value='';
    document.getElementById('f_posted').value=iso(new Date());
    del.hidden=true;
  }
  overlay.hidden=false;
}
function closeModal(){ overlay.hidden=true; }
form.addEventListener('submit', e=>{
  e.preventDefault();
  const id=document.getElementById('jobId').value;
  const status=document.getElementById('f_status').value;
  const data={
    role:document.getElementById('f_role').value.trim(),
    company:document.getElementById('f_company').value.trim(),
    status,
    link:document.getElementById('f_link').value.trim(),
    mailed:+document.getElementById('f_mailed').value||0,
    gotReferral:+document.getElementById('f_gotref').value?1:0,
    posted:document.getElementById('f_posted').value,
    expiry:document.getElementById('f_expiry').value,
    interviewDate:document.getElementById('f_interview').value,
    followUpDate:document.getElementById('f_followup').value,
    notes:document.getElementById('f_notes').value.trim(),
  };
  const actioned=status==='applied'||status==='got-referral';
  if(id){
    const j=jobs.find(x=>x.id===id);
    const wasActioned=j.status==='applied'||j.status==='got-referral';
    Object.assign(j,data);
    if(actioned && !j.appliedDate) j.appliedDate=iso(new Date());
    if(!actioned && !wasActioned) j.appliedDate=null;
    toast('Job updated ✓');
  } else {
    jobs.push({ id:uid(), ...data, appliedDate:actioned?iso(new Date()):null, order:Date.now(), createdAt:Date.now() });
    toast('Job added ✓');
  }
  save(); renderDashboard(); closeModal();
});
document.getElementById('deleteJobBtn').addEventListener('click', ()=>{
  const id=document.getElementById('jobId').value;
  if(id && confirm('Delete this job permanently?')){ jobs=jobs.filter(x=>x.id!==id); save(); renderDashboard(); closeModal(); toast('Job deleted'); }
});
document.getElementById('addJobBtn').addEventListener('click', ()=> openModal());
document.getElementById('emptyAddBtn').addEventListener('click', ()=> openModal());
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
document.getElementById('searchInput').addEventListener('input', renderDashboard);
document.getElementById('statusFilter').addEventListener('change', renderDashboard);

/* ===================================================================
   INSIGHTS
   =================================================================== */
function appliedByDay(){ const m={}; jobs.forEach(j=>{ if(j.appliedDate) m[j.appliedDate]=(m[j.appliedDate]||0)+1; }); return m; }
function streak(map){ let s=0,d=today0(); if(!map[iso(d)]) d=addDays(d,-1); while(map[iso(d)]){ s++; d=addDays(d,-1);} return s; }

function renderInsights(){
  const map=appliedByDay();
  const totalApplied=Object.values(map).reduce((a,b)=>a+b,0);
  const todayN=map[iso(new Date())]||0;
  let weekN=0; for(let i=0;i<7;i++) weekN+=map[iso(addDays(today0(),-i))]||0;
  const activeDays=Object.keys(map).length;
  const avg=activeDays?(totalApplied/activeDays).toFixed(1):'0';
  document.getElementById('insightStats').innerHTML=[
    statCard('Current streak',streak(map)+'🔥',streak(map)?'days in a row':'apply today!','🔥','#37d399'),
    statCard('Applied today',todayN,'so far','📌','#56b4ff'),
    statCard('This week',weekN,'last 7 days','🗓️','#6d8bff'),
    statCard('Total applied',totalApplied,`across ${activeDays} active days`,'✅','#a06bff'),
    statCard('Daily average',avg,'on active days','📊','#ffb454'),
  ].join('');
  renderHeatmap(map); renderWeeklyBars(map); renderBreakdown();
}
function level(n){ return n<=0?0:n===1?1:n===2?2:n<=4?3:4; }
function renderHeatmap(map){
  const weeks=18,end=today0(),endSunday=addDays(end,-end.getDay()),start=addDays(endSunday,-(weeks-1)*7);
  let html='';
  for(let w=0;w<weeks;w++) for(let d=0;d<7;d++){
    const day=addDays(start,w*7+d);
    if(day>end){ html+=`<i style="visibility:hidden"></i>`; continue; }
    const n=map[iso(day)]||0, lv=level(n);
    html+=`<i class="${lv?'lvl'+lv:''}" title="${n} on ${day.toLocaleDateString()}"></i>`;
  }
  document.getElementById('heatmap').innerHTML=html;
}
function renderWeeklyBars(map){
  const weeks=8,data=[],sow=addDays(today0(),-today0().getDay());
  for(let i=weeks-1;i>=0;i--){ const ws=addDays(sow,-i*7); let n=0; for(let d=0;d<7;d++) n+=map[iso(addDays(ws,d))]||0; data.push({n,label:fmtDate(iso(ws))}); }
  const max=Math.max(1,...data.map(d=>d.n));
  document.getElementById('weeklyBars').innerHTML=data.map(d=>`<div class="bar-col"><div class="bar" style="height:${(d.n/max)*100}%"><span class="bval">${d.n||''}</span></div><span class="bar-label">${d.label}</span></div>`).join('');
}
function renderBreakdown(){
  const total=jobs.length||1;
  document.getElementById('breakdown').innerHTML=Object.entries(STATUS).map(([k,v])=>{
    const n=jobs.filter(j=>j.status===k).length;
    return `<div class="bd-row"><span class="bd-label"><span class="pill ${k}" style="padding:3px 8px">${v.label}</span></span><span class="bd-track"><span class="bd-fill" style="width:${(n/total)*100}%;background:${v.color}"></span></span><span class="bd-val">${n}</span></div>`;
  }).join('');
}

/* ===================================================================
   ALERTS
   =================================================================== */
function urgentJobs(){ return jobs.filter(j=>expiryInfo(j).urgent).sort((a,b)=>expiryInfo(a).du-expiryInfo(b).du); }
// upcoming interviews within 14 days; follow-ups due within 3 days (incl. overdue)
function interviewItems(){ return jobs.filter(j=>{ const d=daysUntil(j.interviewDate); return j.interviewDate && d!=null && d>=0 && d<=14; }).sort((a,b)=>daysUntil(a.interviewDate)-daysUntil(b.interviewDate)); }
function followupItems(){ return jobs.filter(j=>{ const d=daysUntil(j.followUpDate); return j.followUpDate && d!=null && d<=3; }).sort((a,b)=>daysUntil(a.followUpDate)-daysUntil(b.followUpDate)); }
function attentionCount(){
  const intvSoon=jobs.filter(j=>{ const d=daysUntil(j.interviewDate); return j.interviewDate && d!=null && d>=0 && d<=2; }).length;
  const fuDue=jobs.filter(j=>{ const d=daysUntil(j.followUpDate); return j.followUpDate && d!=null && d<=1; }).length;
  return urgentJobs().length + intvSoon + fuDue;
}
function refreshAlertBadge(){
  const n=attentionCount(), exp=urgentJobs().length;
  ['alertBadge','alertBadgeM'].forEach(id=>{ const el=document.getElementById(id); el.textContent=n; el.hidden=n===0; });
  const banner=document.getElementById('alertBanner');
  if(exp>0 && sessionStorage.getItem('af_banner')!==String(exp)){
    document.getElementById('alertBannerText').textContent=`${exp} job${exp>1?'s':''} expiring soon and still need action — apply now before ${exp>1?'they':'it'} expire${exp>1?'':'s'}!`;
    banner.hidden=false;
  }
  if(exp===0) banner.hidden=true;
}
document.getElementById('alertBannerClose').addEventListener('click', ()=>{ document.getElementById('alertBanner').hidden=true; sessionStorage.setItem('af_banner',String(urgentJobs().length)); });
document.getElementById('alertBannerGo').addEventListener('click', ()=>{ document.getElementById('alertBanner').hidden=true; setView('alerts'); });

function alertRow(j, icon, dstr, color){
  const d=daysUntil(dstr);
  const txt = d<0?`${Math.abs(d)}d overdue` : d===0?'Today' : `In ${d} day${d>1?'s':''}`;
  return `<div class="alert-row"><span class="ar-ic">${icon}</span><div class="ar-main"><b>${esc(j.role)}</b> — ${esc(j.company)}<p>Status: ${STATUS[j.status].label}${j.link?` · <a class="job-link" href="${esc(j.link)}" target="_blank" rel="noopener">Open ↗</a>`:''}</p></div><span class="ar-days" style="color:${color}">${txt}</span></div>`;
}
function renderAlerts(){
  const exp=urgentJobs(), intv=interviewItems(), fu=followupItems(), box=document.getElementById('alertList');
  if(!exp.length && !intv.length && !fu.length){ box.innerHTML=`<div class="alert-none">🎉 You're all caught up — nothing needs attention right now.</div>`; return; }
  let html='';
  if(exp.length){
    html+=`<div class="alert-sub">⏰ Expiring soon — apply now</div>`;
    html+=exp.map(j=>{ const du=daysUntil(j.expiry); const txt=du<0?'Expired':du===0?'Expires today':`${du} day${du>1?'s':''} left`; const color=du<=settings.soonDays?'var(--red)':'var(--amber)';
      return `<div class="alert-row"><span class="ar-ic">⏰</span><div class="ar-main"><b>${esc(j.role)}</b> — ${esc(j.company)}<p>Status: ${STATUS[j.status].label}${j.link?` · <a class="job-link" href="${esc(j.link)}" target="_blank" rel="noopener">Open ↗</a>`:''}</p></div><span class="ar-days" style="color:${color}">${txt}</span></div>`; }).join('');
  }
  if(intv.length){
    html+=`<div class="alert-sub">📅 Upcoming interviews</div>`;
    html+=intv.map(j=>alertRow(j,'📅',j.interviewDate,'var(--brand-2)')).join('');
  }
  if(fu.length){
    html+=`<div class="alert-sub">📨 Follow-ups due</div>`;
    html+=fu.map(j=>alertRow(j,'📨',j.followUpDate,'var(--blue)')).join('');
  }
  box.innerHTML=html;
}

/* ===================================================================
   NOTIFICATIONS + DAILY REMINDER
   =================================================================== */
function notify(title,body){
  if(!('Notification' in window) || Notification.permission!=='granted') return false;
  try { new Notification(title,{body}); return true; } catch { return false; }
}
function expiryNotifyOnLoad(){
  const n=urgentJobs().length; if(n) notify('ApplyFlow ⏰',`${n} job${n>1?'s':''} expiring soon — apply now!`);
}
function checkReminder(){
  if(!settings.reminderEnabled) return;
  const now=new Date(), hhmm=now.toTimeString().slice(0,5), tIso=iso(now);
  if(hhmm>=settings.reminderTime && settings.lastReminder!==tIso){
    settings.lastReminder=tIso; saveSettings();
    const fired=notify('ApplyFlow — time to apply! 🚀','Open a few postings and keep your streak alive.');
    toast('🔔 Daily reminder: time to apply for jobs today!');
    if(!fired) {/* toast already shown */}
  }
}
setInterval(checkReminder, 30000);

/* ===================================================================
   RESUME MATCH (+ PDF parsing)
   =================================================================== */
const STOP=new Set('a an the and or but of to in on for with at by from as is are was were be been being this that these those you your we our they their it its will would can could should may might must have has had do does did not no nor so if then than also into out up down over under more most other some such own same too very just about per via using use used work working role job team teams company companies will candidate candidates ideal preferred plus etc our we us their your his her them they who what which when where how all any each able strong good great excellent looking join help build building'.split(/\s+/));
function tokens(t){ return (t.toLowerCase().match(/[a-z][a-z0-9+#.\-]{1,}/g)||[]).map(w=>w.replace(/^[.\-]+|[.\-]+$/g,'')).filter(w=>w.length>2 && !STOP.has(w)); }
function analyze(resume,jd){
  const rSet=new Set(tokens(resume)), freq={};
  tokens(jd).forEach(w=>freq[w]=(freq[w]||0)+1);
  const keywords=Object.keys(freq).sort((a,b)=>freq[b]-freq[a]).slice(0,40);
  const matched=keywords.filter(k=>rSet.has(k)), missing=keywords.filter(k=>!rSet.has(k));
  return { score:keywords.length?Math.round(matched.length/keywords.length*100):0, matched, missing, total:keywords.length };
}
document.getElementById('analyzeBtn').addEventListener('click', ()=>{
  const r=document.getElementById('resumeText').value, jd=document.getElementById('jdText').value;
  if(r.trim().length<30||jd.trim().length<30){ toast('Add more text to both boxes first'); return; }
  showMatch(analyze(r,jd));
});
function showMatch(r){
  document.getElementById('matchResult').hidden=false;
  const circ=2*Math.PI*52, fg=document.getElementById('gaugeFg');
  fg.style.strokeDasharray=circ; fg.style.strokeDashoffset=circ;
  const color=r.score>=70?'#37d399':r.score>=45?'#ffb454':'#ff6b81'; fg.style.stroke=color;
  let cur=0; const numEl=document.getElementById('scoreNum');
  const finalOffset=circ-(circ*r.score/100);
  const step=()=>{ cur+=Math.ceil((r.score-cur)/6)||1; if(cur>r.score)cur=r.score; numEl.textContent=cur; fg.style.strokeDashoffset=circ-(circ*cur/100); if(cur<r.score) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  // guarantee the final value lands even if rAF is throttled (e.g. background tab)
  setTimeout(()=>{ numEl.textContent=r.score; fg.style.strokeDashoffset=finalOffset; }, 1200);
  const verdict=r.score>=70?'Strong match 🚀':r.score>=45?'Decent match — tune it ✍️':'Needs work 🔧';
  const v=document.getElementById('scoreVerdict'); v.textContent=verdict; v.style.color=color;
  document.getElementById('scoreNote').textContent=`Your résumé covers ${r.matched.length} of ${r.total} key terms. ${r.score>=70?"You're likely to pass keyword screening.":r.score>=45?'Add the missing keywords (where true) to boost your odds.':'Significant gaps — align your résumé closely with this role.'}`;
  document.getElementById('matchCount').textContent=r.matched.length;
  document.getElementById('missCount').textContent=r.missing.length;
  document.getElementById('matchedChips').innerHTML=r.matched.length?r.matched.map(k=>`<span class="chip ok">${esc(k)}</span>`).join(''):'<span style="color:var(--muted)">None yet</span>';
  document.getElementById('missingChips').innerHTML=r.missing.length?r.missing.map(k=>`<span class="chip miss">${esc(k)}</span>`).join(''):'<span style="color:var(--muted)">Great — nothing major missing!</span>';
  document.getElementById('matchResult').scrollIntoView({behavior:'smooth'});
}
const PDFJS_CDN='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
let pdfjsLoading;
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(pdfjsLoading) return pdfjsLoading;
  pdfjsLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src=`${PDFJS_CDN}/pdf.min.js`;
    s.onload=()=>res(window.pdfjsLib); s.onerror=()=>rej(new Error('pdf.js failed to load (need internet)'));
    document.head.appendChild(s);
  });
  return pdfjsLoading;
}
async function pdfToText(file){
  const pdfjs=await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc=`${PDFJS_CDN}/pdf.worker.min.js`;
  const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  let text='';
  for(let i=1;i<=pdf.numPages;i++){ const c=await (await pdf.getPage(i)).getTextContent(); text+=c.items.map(it=>it.str).join(' ')+'\n'; }
  return text;
}
function readFileInto(input,target){
  input.addEventListener('change', async ()=>{
    const f=input.files[0]; if(!f) return;
    try{
      if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){
        toast('Reading PDF…'); document.getElementById(target).value=await pdfToText(f); toast('PDF loaded ✓');
      } else {
        const rd=new FileReader(); rd.onload=()=>{ document.getElementById(target).value=rd.result; toast('File loaded ✓'); }; rd.readAsText(f);
      }
    } catch(err){ console.error(err); toast('Could not read that file'); }
    input.value='';
  });
}
readFileInto(document.getElementById('resumeFile'),'resumeText');
readFileInto(document.getElementById('jdFile'),'jdText');

/* ===================================================================
   DATA: export / import / clear
   =================================================================== */
function download(name,content,type){
  const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}
function exportJSON(){ download(`applyflow-backup-${iso(new Date())}.json`, JSON.stringify(jobs,null,2), 'application/json'); toast('Exported JSON ✓'); }
function exportCSV(){
  const cols=['role','company','status','link','mailed','gotReferral','posted','expiry','interviewDate','followUpDate','appliedDate','notes'];
  const esc2=s=>`"${String(s??'').replace(/"/g,'""')}"`;
  const rows=[cols.join(',')].concat(jobs.map(j=>cols.map(c=>esc2(j[c])).join(',')));
  download(`applyflow-export-${iso(new Date())}.csv`, rows.join('\r\n'), 'text/csv'); toast('Exported CSV ✓');
}
function doImport(){ document.getElementById('importFile').click(); }
document.getElementById('importFile').addEventListener('change', e=>{
  const f=e.target.files[0]; if(!f) return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const data=JSON.parse(rd.result);
      if(!Array.isArray(data)) throw 0;
      const clean=data.filter(j=>j&&j.role&&j.company).map(j=>({
        id:j.id||uid(), role:String(j.role), company:String(j.company),
        status:STATUS[j.status]?j.status:'not-applied', link:j.link||'',
        mailed:+j.mailed||0, gotReferral:j.gotReferral?1:0,
        posted:j.posted||'', expiry:j.expiry||'', appliedDate:j.appliedDate||null,
        interviewDate:j.interviewDate||'', followUpDate:j.followUpDate||'',
        notes:j.notes||'', order:j.order!=null?j.order:(j.createdAt||Date.now()), createdAt:j.createdAt||Date.now(),
      }));
      if(confirm(`Import ${clean.length} jobs? This replaces your current ${jobs.length}.`)){
        jobs=clean; save(); renderDashboard(); closeSettings(); toast(`Imported ${clean.length} jobs ✓`);
      }
    } catch{ toast('Invalid JSON file'); }
    e.target.value='';
  };
  rd.readAsText(f);
});
function clearAll(){ if(confirm('Delete ALL jobs permanently? Export a backup first if unsure.')){ jobs=[]; save(); renderDashboard(); toast('All data cleared'); } }

function handleDataAct(act){
  if(act==='export-json') exportJSON();
  else if(act==='export-csv') exportCSV();
  else if(act==='import') doImport();
  else if(act==='clear') clearAll();
}
/* dashboard dropdown */
const dataBtn=document.getElementById('dataBtn'), dataDrop=document.getElementById('dataDropdown');
dataBtn.addEventListener('click', e=>{ e.stopPropagation(); dataDrop.hidden=!dataDrop.hidden; });
document.addEventListener('click', ()=>{ dataDrop.hidden=true; });
dataDrop.addEventListener('click', e=>{ const b=e.target.closest('button'); if(b){ dataDrop.hidden=true; handleDataAct(b.dataset.act); } });
/* settings buttons reuse same acts */
document.querySelectorAll('#settingsOverlay [data-act]').forEach(b=> b.addEventListener('click', ()=> handleDataAct(b.dataset.act)));

/* ===================================================================
   SETTINGS panel + theme
   =================================================================== */
const settingsOverlay=document.getElementById('settingsOverlay');
function openSettings(){
  document.getElementById('reminderEnabled').checked=settings.reminderEnabled;
  document.getElementById('reminderTime').value=settings.reminderTime;
  document.getElementById('soonDays').value=settings.soonDays;
  document.getElementById('soonDaysVal').textContent=settings.soonDays;
  updatePermState();
  settingsOverlay.hidden=false;
}
function closeSettings(){ settingsOverlay.hidden=true; }
document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('settingsClose').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', e=>{ if(e.target===settingsOverlay) closeSettings(); });

document.getElementById('reminderEnabled').addEventListener('change', e=>{
  settings.reminderEnabled=e.target.checked; saveSettings();
  if(e.target.checked){ requestPerm(); toast('Daily reminder on'); } else toast('Daily reminder off');
});
document.getElementById('reminderTime').addEventListener('change', e=>{ settings.reminderTime=e.target.value; settings.lastReminder=''; saveSettings(); });
document.getElementById('soonDays').addEventListener('input', e=>{
  settings.soonDays=+e.target.value; document.getElementById('soonDaysVal').textContent=e.target.value;
  saveSettings(); renderDashboard();
});
document.getElementById('notifyPermBtn').addEventListener('click', requestPerm);

function requestPerm(){
  if(!('Notification' in window)){ toast('Notifications not supported here'); return; }
  if(Notification.permission==='granted'){ updatePermState(); return; }
  Notification.requestPermission().then(()=>{ updatePermState(); notify('ApplyFlow ✓','Notifications enabled.'); });
}
function updatePermState(){
  const el=document.getElementById('permState');
  if(!('Notification' in window)){ el.textContent='not supported'; return; }
  el.textContent = Notification.permission==='granted'?'✓ enabled':Notification.permission==='denied'?'blocked in browser':'not enabled yet';
}

/* theme */
function applyTheme(){
  document.body.classList.toggle('light', settings.theme==='light');
  document.getElementById('themeBtn').textContent = settings.theme==='light'?'☀️':'🌙';
  document.querySelector('meta[name=theme-color]').setAttribute('content', settings.theme==='light'?'#eef1f9':'#0b1020');
}
document.getElementById('themeBtn').addEventListener('click', ()=>{
  settings.theme=settings.theme==='light'?'dark':'light'; saveSettings(); applyTheme();
});

/* ===================================================================
   UTIL + BOOT
   =================================================================== */
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function pct(a,b){ return b?Math.round(a/b*100):0; }
let toastT;
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.hidden=false; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.hidden=true,300); },2400); }

applyTheme();
renderDashboard();
expiryNotifyOnLoad();
checkReminder();
