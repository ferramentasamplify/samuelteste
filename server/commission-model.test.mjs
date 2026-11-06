import test from 'node:test';
import assert from 'node:assert/strict';
import { commissionReport, BRUNO, KEIZE } from './commission-model.mjs';
const dataset = {
  today: '2026-10-31', generatedAt: '2026-10-31T21:00:00Z',
  responsibles: [{id: BRUNO,name:'Bruno'}, {id: KEIZE,name:'Keize'}, {id:'other',name:'Outro'}],
  creators: [
    {id:'old',creatorId:'old',gmv:900000,status:'AGENCIADO',responsibleIds:[BRUNO],editedDate:'2026-10-07'},
    {id:'shared',creatorId:'shared',gmv:100000,status:'AGENCIADO',responsibleIds:[BRUNO,KEIZE],editedDate:'2026-10-08'},
    {id:'solo',creatorId:'solo',gmv:100000,status:'Convite Aceito',responsibleIds:[KEIZE],editedDate:'2026-10-10'},
    {id:'meeting',creatorId:'meeting',gmv:100000,status:'Reunião Realizada',responsibleIds:[KEIZE],editedDate:'2026-10-11'},
    {id:'scheduled',creatorId:'scheduled',gmv:100000,status:'Reunião Agendada',responsibleIds:[KEIZE],editedDate:'2026-10-12'},
    {id:'september',creatorId:'september',gmv:100000,status:'AGENCIADO',responsibleIds:[BRUNO],editedDate:'2026-09-01'},
  ],
  goals:{status:'ok',daily:[{date:'2026-10-01',stage:'Reuniões agendadas',metric:'gmv',normalDaily:400000},{date:'2026-10-01',stage:'Agenciado',metric:'gmv',normalDaily:200000}]},
};
test('cutoff inclusive, full-month team goals, shared lead counted once',()=>{
 const r=commissionReport(dataset,'2026-10','keizepassos');
 assert.equal(r.team.scheduled.gmv,400000); assert.equal(r.team.agency.gmv,200000);
 assert.equal(r.team.agency.goal,200000); assert.equal(r.start,'2026-10-08');
 assert.equal(r.totals.scheduled.gmv,300000); assert.equal(r.totals.scheduled.commission,96);
 assert.equal(r.totals.agency.commission,40); assert.equal(r.totals.closer.commission,100); assert.equal(r.total,236);
 assert.equal(r.leads.find(x=>x.id==='solo').parts.length,3);
 assert.equal(r.leads.find(x=>x.id==='shared').parts.length,2);
 assert.equal(r.leads.some(x=>x.id==='scheduled'),false);
});
test('account isolation ignores person override and Bruno only receives closer',()=>{
 const r=commissionReport(dataset,'2026-10','brunozardo',undefined,KEIZE);
 assert.equal(r.person.id,BRUNO); assert.deepEqual(Object.keys(r.totals),['closer']);
 assert.equal(r.total,100); assert.equal(r.leads.length,1); assert.equal(r.people.length,0);
});
test('SDR agency includes all monthly closures without extending personal meeting or closer commissions',()=>{
 const expanded={...dataset,creators:[...dataset.creators,
  {id:'bruno-only',creatorId:'bruno-only',gmv:50000,status:'AGENCIADO',responsibleIds:[BRUNO],editedDate:'2026-10-15'},
  {id:'unassigned',creatorId:'unassigned',gmv:50000,status:'Convite Aceito',responsibleIds:[],editedDate:'2026-10-16'},
  {id:'other-meeting',creatorId:'other-meeting',gmv:50000,status:'Reunião Realizada',responsibleIds:[BRUNO],editedDate:'2026-10-17'}]};
 const r=commissionReport(expanded,'2026-10','keizepassos');
 assert.equal(r.totals.agency.gmv,300000);
 assert.equal(r.totals.agency.gmv,r.team.agency.gmv);
 assert.equal(r.totals.agency.commission,120);
 assert.equal(r.totals.scheduled.gmv,300000);
 assert.equal(r.totals.closer.gmv,100000);
 for(const id of ['bruno-only','unassigned']) assert.deepEqual(r.leads.find(x=>x.id===id).parts.map(x=>x.role),['agency']);
 assert.ok(!r.leads.some(x=>x.id==='other-meeting'));
 const excluded=commissionReport(expanded,'2026-10','keizepassos',undefined,'',{[`2026-10:${KEIZE}:bruno-only`]:{included:false}});
 assert.equal(excluded.totals.agency.gmv,250000);
 assert.equal(excluded.team.agency.gmv,300000);
 const closer=commissionReport(expanded,'2026-10','brunozardo');
 assert.equal(closer.totals.closer.gmv,150000);
 assert.deepEqual(Object.keys(closer.totals),['closer']);
});
test('months other than October include the first day and missing goals do not invent rates',()=>{
 const r=commissionReport(dataset,'2026-09','brunozardo');
 assert.equal(r.start,'2026-09-01'); assert.equal(r.leads.length,1); assert.equal(r.total,null);
});
test('below 50 percent is inactive with zero commission and other account cannot select Bruno or Keize',()=>{
 const low={...dataset,goals:{status:'ok',daily:dataset.goals.daily.map(x=>({...x,normalDaily:10000000}))}};
 const inactive=commissionReport(low,'2026-10','keizepassos');
 assert.equal(inactive.total,0);
 assert.ok(Object.values(inactive.totals).every(x=>x.inactive && x.rate===0 && x.commission===0));
 assert.ok(inactive.leads.every(x=>x.parts.every(p=>p.inactive && p.commission===0)));
 const r=commissionReport(dataset,'2026-10','outro',undefined,BRUNO);
 assert.equal(r.person.id,'other'); assert.equal(r.total,null);
});
test('excluding a lead updates personal totals only, with month and person isolation',()=>{
 const key=`2026-10:${KEIZE}:shared`;
 const saved={[key]:{included:false}};
 const r=commissionReport(dataset,'2026-10','keizepassos',undefined,'',saved);
 assert.equal(r.total,184); assert.equal(r.totals.scheduled.gmv,200000); assert.equal(r.totals.agency.gmv,100000);
 assert.equal(r.excludedCount,1); assert.equal(r.leads.find(x=>x.id==='shared').included,false);
 assert.equal(r.team.agency.gmv,200000); assert.equal(r.team.scheduled.gmv,400000);
 assert.equal(commissionReport(dataset,'2026-10','brunozardo',undefined,'',saved).total,100);
 assert.equal(commissionReport(dataset,'2026-10','keizepassos',undefined,'',{[key]:{included:true}}).total,236);
});
test('category filters separate meetings, shared closures, and solo closures',()=>{
 const r=commissionReport(dataset,'2026-10','keizepassos');
 assert.equal(r.leads.find(x=>x.id==='shared').category,'agency');
 assert.equal(r.leads.find(x=>x.id==='solo').category,'closer');
 assert.equal(r.leads.find(x=>x.id==='meeting').category,'scheduled');
});

test('management consolidates Bruno and Keize without duplicate leads and preserves exclusions',()=>{
 const saved={[`2026-10:${KEIZE}:shared`]:{included:false}};
 const report=commissionReport(dataset,'2026-10','gestao',undefined,'other',saved);
 assert.equal(report.management,true);
 assert.deepEqual(report.members.map(item=>item.person.id),[BRUNO,KEIZE]);
 assert.equal(report.members[0].total,100);
 assert.equal(report.members[1].total,184);
 assert.equal(report.leads.length,3);
 const shared=report.leads.find(item=>item.id==='shared');
 assert.equal(shared.sdr,'Keize Passos'); assert.equal(shared.closer,'Bruno');
 assert.equal(shared.commissions.length,2);
 assert.equal(shared.commissions.find(item=>item.person.id===KEIZE).included,false);
 assert.equal(shared.commissions.find(item=>item.person.id===BRUNO).included,true);
 assert.equal(report.leads.find(item=>item.id==='solo').closer,'Keize Passos');
 assert.equal(report.leads.find(item=>item.id==='meeting').closer,'Não identificado');
 assert.ok(!report.leads.some(item=>item.id==='old'));
});
test('team exclusion recalculates achievement, bands and both commissions while preserving monthly goals and personal selections',()=>{
 const saved={[`2026-10:team:shared`]:{included:false,reason:'Lead inválido'},[`2026-10:${KEIZE}:meeting`]:{included:false}};
 const sdr=commissionReport(dataset,'2026-10','keizepassos',undefined,'',saved);
 const closer=commissionReport(dataset,'2026-10','brunozardo',undefined,'',saved);
 assert.equal(sdr.team.agency.gmv,100000); assert.equal(sdr.team.agency.goal,200000);
 assert.equal(sdr.team.agency.ratio,.5); assert.equal(sdr.team.agency.band.closer,.03);
 assert.equal(sdr.team.scheduled.gmv,300000); assert.equal(sdr.team.scheduled.goal,400000);
 assert.equal(sdr.totals.scheduled.gmv,100000); assert.equal(sdr.totals.scheduled.commission,30);
 assert.equal(sdr.totals.agency.commission,0); assert.equal(sdr.totals.closer.commission,30);
 assert.equal(sdr.total,60); assert.equal(closer.total,0);
 assert.equal(closer.leads.find(item=>item.id==='shared').included,false);
 const management=commissionReport(dataset,'2026-10','gestao',undefined,'',saved);
 assert.equal(management.leads.find(item=>item.id==='shared').exclusionReason,'Lead inválido');
 assert.deepEqual(management.team,sdr.team);
 const restored={...saved,[`2026-10:team:shared`]:{included:true}};
 const r=commissionReport(dataset,'2026-10','keizepassos',undefined,'',restored);
 assert.equal(r.team.agency.gmv,200000); assert.equal(r.leads.find(item=>item.id==='meeting').included,false);
 assert.equal(commissionReport(dataset,'2026-09','brunozardo',undefined,'',saved).leads[0].included,true);
});

test('activation starts at 50 percent and each goal activates independently',()=>{
 const atHalf={...dataset,goals:{status:'ok',daily:dataset.goals.daily.map(x=>({...x,normalDaily:x.normalDaily*2}))}};
 const half=commissionReport(atHalf,'2026-10','keizepassos');
 assert.equal(half.totals.closer.rate,.03); assert.equal(half.totals.closer.inactive,false);
 const mixed={...dataset,goals:{status:'ok',daily:dataset.goals.daily.map(x=>({...x,normalDaily:x.stage==='Agenciado'?10000000:x.normalDaily}))}};
 const report=commissionReport(mixed,'2026-10','keizepassos');
 assert.equal(report.totals.scheduled.commission,96); assert.equal(report.totals.closer.commission,0); assert.equal(report.total,96);
 const unknown=commissionReport({...dataset,goals:{status:'error',daily:dataset.goals.daily}},'2026-10','keizepassos');
 assert.equal(unknown.total,null); assert.equal(unknown.totals.closer.inactive,false);
});
