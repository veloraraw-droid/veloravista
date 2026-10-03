const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');
const source = ts.transpileModule(fs.readFileSync('app/api/invoices/[id]/interac/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(options = {}) {
  let invoice = { id: 'invoice-1', company_id: 'company-1', status: 'active', updated_at: 'v1', data: { number: 'VV-100', total: 105, status: 'sent', email: 'client@example.com', ...options.data } };
  let writes = 0, emails = 0, expired = 0;
  const user = options.user === null ? null : { id: 'client-1', role: 'client', companyId: 'company-1', ...options.user };
  const db = { from(table) {
    let update, filters = [];
    const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, neq() { return q; }, update(v) { update = v; return q; }, insert() { return Promise.resolve({error:null}); }, single() { return Promise.resolve({data:invoice}); }, maybeSingle() {
      if (options.conflict || filters.some(([k,v])=> k === 'updated_at' && v !== invoice.updated_at)) return Promise.resolve({data:null});
      writes++; invoice = {...invoice,...update,updated_at:'v2'}; return Promise.resolve({data:{id:invoice.id},error:null});
    }, then(resolve) { resolve({data: table === 'profiles' ? [{id:'client-1',email:'client@example.com'}] : [],error:null}); } }; return q;
  } };
  class Stripe { constructor() { this.checkout = { sessions: { retrieve: async () => options.session || {id:'cs_1',status:'open',payment_status:'unpaid'}, expire: async () => { expired++; } } }; } }
  const module = { exports: {} };
  const imports = {
    'next/server': {NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}},
    stripe: {default:Stripe},
    '../../../../../lib/auth': {getAppUser:async()=>user},
    '../../../../../lib/permissions': {canAccessModule:(role,permissions)=>role==='owner'||permissions?.billing},
    '../../../../../lib/supabase/server': {createAdminSupabase:()=>db},
    '../../../../../lib/interac': {INTERAC_EMAIL:'velora-vista-visuals-ltd@vennpay.ca'},
    '../../../../../lib/transactional-email': {sendInternalCustomerUpdate:async()=>{emails++;return true},sendTransactionalEmail:async()=>{emails++;return true}},
  };
  vm.runInNewContext(source,{exports:module.exports,require:name=>imports[name],process:{env:{}},URL,Date,Number,String,Boolean});
  const post = action => module.exports.POST({url:'https://veloravistavisuals.com/api/invoices/invoice-1/interac',headers:new Headers({origin:options.origin||'https://veloravistavisuals.com'}),json:async()=>({action})},{params:Promise.resolve({id:'invoice-1'})});
  return {post, state:()=>({invoice,writes,emails,expired})};
}
test('client reports pending without marking paid; repeat sends no duplicate email',async()=>{const h=harness();assert.equal((await h.post('report')).status,200);assert.equal(h.state().invoice.data.status,'etransfer_pending');assert.equal(h.state().invoice.data.paidAt,undefined);await h.post('report');assert.equal(h.state().writes,1);assert.equal(h.state().emails,1)});
test('another company cannot report payment',async()=>{const h=harness({user:{companyId:'other'}});assert.equal((await h.post('report')).status,403);assert.equal(h.state().writes,0)});
test('client cannot confirm receipt',async()=>{const h=harness({data:{status:'etransfer_pending'}});assert.equal((await h.post('confirm')).status,403)});
test('staff without billing permission cannot confirm',async()=>{const h=harness({user:{role:'team',permissions:{}}});assert.equal((await h.post('confirm')).status,403)});
test('owner confirms receipt and customer email; repeated confirmation is idempotent',async()=>{const h=harness({user:{role:'owner'},data:{status:'etransfer_pending'}});assert.equal((await h.post('confirm')).status,200);assert.equal(h.state().invoice.data.status,'paid');assert.equal(h.state().invoice.data.paymentMethod,'interac_etransfer');assert.equal(h.state().invoice.data.interacConfirmedBy,'client-1');assert.equal(h.state().emails,2);await h.post('confirm');assert.equal(h.state().writes,1);assert.equal(h.state().emails,2)});
test('confirmation requires a pending report',async()=>{const h=harness({user:{role:'owner'}});assert.equal((await h.post('confirm')).status,409)});
test('stale invoice update cannot overwrite a competing payment',async()=>{const h=harness({conflict:true});assert.equal((await h.post('report')).status,409);assert.equal(h.state().emails,0)});
test('void and invalid totals reject payment',async()=>{for(const data of [{status:'void'},{total:0},{total:'bad'}]) {const h=harness({data});assert.equal((await h.post('report')).status,400);assert.equal(h.state().writes,0)}});
test('signed out and cross origin requests are rejected',async()=>{assert.equal((await harness({user:null}).post('report')).status,401);assert.equal((await harness({origin:'https://other.example'}).post('report')).status,403)});
test('existing card checkout is expired before pending e-Transfer',async()=>{const h=harness({data:{stripeCheckoutSessionId:'cs_1'}});assert.equal((await h.post('report')).status,200);assert.equal(h.state().expired,1)});
test('completed card payment prevents offline payment overwrite',async()=>{const h=harness({data:{stripeCheckoutSessionId:'cs_1'},session:{status:'complete',payment_status:'paid'}});assert.equal((await h.post('report')).status,409);assert.equal(h.state().writes,0)});
