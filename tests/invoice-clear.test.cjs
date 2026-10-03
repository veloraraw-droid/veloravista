const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const fs = require('node:fs');
const source = ts.transpileModule(fs.readFileSync('app/api/invoices/[id]/clear/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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
    '../../../../../lib/interac': {PAYMENT_METHODS:{cash:'Cash',personal_etransfer:'Personal e-Transfer'}},
    '../../../../../lib/finance': {validFinanceDate:value=>{if(value==='2099-01-01') throw new Error('Invalid date');return value;}},
    '../../../../../lib/transactional-email': {sendInternalCustomerUpdate:async()=>{emails++;return true},sendTransactionalEmail:async()=>{emails++;return true}},
  };
  vm.runInNewContext(source,{exports:module.exports,require:name=>imports[name],process:{env:{}},URL,Date,Number,String,Boolean});
  const post = (method = 'cash', paidDate = '2026-09-20') => module.exports.POST({url:'https://veloravistavisuals.com/api/invoices/invoice-1/interac',headers:new Headers({origin:options.origin||'https://veloravistavisuals.com'}),json:async()=>({method,paidDate,reference:'received-in-person'})},{params:Promise.resolve({id:'invoice-1'})});
  return {post, state:()=>({invoice,writes,emails,expired})};
}
test('owner records cash with method date reference and audit fields',async()=>{const h=harness({user:{role:'owner'}});assert.equal((await h.post()).status,200);const d=h.state().invoice.data;assert.equal(d.status,'paid');assert.equal(d.paymentMethod,'cash');assert.equal(d.paidDate,'2026-09-20');assert.equal(d.paymentReference,'received-in-person');assert.equal(d.paymentRecordedBy,'client-1');assert.equal(h.state().emails,2);await h.post();assert.equal(h.state().writes,1);assert.equal(h.state().emails,2)});
test('personal e-Transfer can clear an invoice without a pending report',async()=>{const h=harness({user:{role:'owner'}});assert.equal((await h.post('personal_etransfer')).status,200);assert.equal(h.state().invoice.data.paymentMethod,'personal_etransfer')});
test('clients and staff without billing access cannot clear invoices',async()=>{assert.equal((await harness().post()).status,403);assert.equal((await harness({user:{role:'team',permissions:{}}}).post()).status,403)});
test('cross-origin requests and invalid payment dates are rejected',async()=>{assert.equal((await harness({user:{role:'owner'},origin:'https://other.example'}).post()).status,403);assert.equal((await harness({user:{role:'owner'}}).post('cash','2099-01-01')).status,400)});
test('a submitted card payment cannot be overwritten by offline clearing',async()=>{const h=harness({user:{role:'owner'},data:{stripeCheckoutSessionId:'cs_1'},session:{status:'complete',payment_status:'paid'}});assert.equal((await h.post()).status,409);assert.equal(h.state().writes,0)});
test('void invoices and concurrency conflicts cannot record a receipt',async()=>{assert.equal((await harness({user:{role:'owner'},data:{status:'void'}}).post()).status,400);const h=harness({user:{role:'owner'},conflict:true});assert.equal((await h.post()).status,409);assert.equal(h.state().emails,0)});
