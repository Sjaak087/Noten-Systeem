import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, onValue, runTransaction, push, remove
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const $ = id => document.getElementById(id);
const loginScreen = $("loginScreen"), mainScreen = $("mainScreen");
let products = {};
let stopProductsListener = null;
let loggedIn = false;
let historyEntries = {};

function toast(message){ const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2200); }
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function unitLabel(p){return p.unit==="grams"?"gram":"aantal";}
function amountLabel(p,v){return `${Number(v||0).toLocaleString("nl-NL")} ${unitLabel(p)}`;}
function money(v){return Number(v||0).toLocaleString("nl-NL",{style:"currency",currency:"EUR"});}
function priceParts(v){const n=Math.max(0,Number(v||0));const euro=Math.floor(n+1e-12);const rest=n-euro;const cent=Math.floor(rest*100+1e-9);const milicent=Math.round((rest*100-cent)*100);return {euro,cent,milicent};}
function readPrice(euroId,centId,milicentId){const e=Math.max(0,Math.floor(Number($(euroId)?.value||0)));const c=Math.min(99,Math.max(0,Math.floor(Number($(centId)?.value||0))));const m=Math.min(99,Math.max(0,Math.floor(Number($(milicentId)?.value||0))));return e+c/100+m/10000;}
function priceInputs(prefix,v){const x=priceParts(v);return `<div class="price-parts"><div><label>Euro (€)</label><input id="${prefix}-euro" type="number" min="0" step="1" value="${x.euro}"></div><div><label>Cent</label><input id="${prefix}-cent" type="number" min="0" max="99" step="1" value="${x.cent}" placeholder="00"></div><div><label>Milicent</label><input id="${prefix}-milicent" type="number" min="0" max="99" step="1" value="${String(x.milicent).padStart(2,"0")}" placeholder="00"></div></div>`;}
function priceLabel(p){return `${money(p.price)} / ${unitLabel(p)}`;}
function packageOptions(p){
  const raw=p?.packageOptions;
  if(!raw) return [];
  if(Array.isArray(raw)) return raw.filter(x=>Number(x.grams)>0).map(x=>({grams:Number(x.grams),price:Number(x.price||0)}));
  return Object.values(raw).filter(x=>Number(x?.grams)>0).map(x=>({grams:Number(x.grams),price:Number(x.price||0)}));
}
function packageText(p){return packageOptions(p).map(o=>`${o.grams}g: ${money(o.price)}`).join(" • ");}
function parsePackages(text){
  return String(text||"").split(/[,;\n]+/).map(part=>part.trim()).filter(Boolean).map(part=>{
    const m=part.match(/^(\d+(?:[.,]\d+)?)\s*(?:g|gram|gramm?)?\s*[:=\-]\s*(\d+(?:[.,]\d+)?)/i);
    if(!m)return null;
    return {grams:Number(m[1].replace(",",".")),price:Number(m[2].replace(",","."))};
  }).filter(x=>x&&x.grams>0&&x.price>=0);
}
function packagesForInput(p){ return packageOptions(p).map(o=>`${o.grams}g = ${Number(o.price).toFixed(2)}`).join("\n"); }

async function loadCredentials(){ const snap=await get(ref(db,"credentials")); return snap.exists()?snap.val():null; }
async function checkSetup(){
  try{ const credentials=await loadCredentials();
    if(!credentials||credentials.configured!==true){$("setupNotice").classList.remove("hidden");$("setupNotice").textContent="Dit is de eerste keer. Maak hieronder het vaste account aan.";$("loginForm").classList.add("hidden");$("setupForm").classList.remove("hidden");}
    else{$("setupNotice").classList.add("hidden");$("loginForm").classList.remove("hidden");$("setupForm").classList.add("hidden");}
  }catch(e){$("loginError").textContent="Kan Firebase niet bereiken. Controleer of je Realtime Database toegankelijk is.";}
}

$("setupForm").addEventListener("submit",async e=>{
  e.preventDefault();$("setupError").textContent="";
  const email=$("setupEmail").value.trim(),p1=$("setupPassword").value,p2=$("setupPassword2").value;
  if(!email||!email.includes("@")){ $("setupError").textContent="Vul een geldig e-mailadres in.";return; }
  if(p1.length<1){$("setupError").textContent="Vul een wachtwoord in.";return;}
  if(p1!==p2){$("setupError").textContent="De wachtwoorden zijn niet hetzelfde.";return;}
  try{const existing=await loadCredentials();if(existing?.configured===true){$("setupError").textContent="Er is al een account ingesteld. Log daarmee in.";return;}
    await set(ref(db,"credentials"),{configured:true,email,password:p1,createdAt:Date.now()});$("setupForm").reset();await checkSetup();toast("Account aangemaakt.");
  }catch(err){$("setupError").textContent="Account opslaan mislukt. Controleer je Firebase Realtime Database.";}
});

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();$("loginError").textContent="";
  try{const credentials=await loadCredentials();if(!credentials||credentials.configured!==true){await checkSetup();$("loginError").textContent="Er is nog geen account ingesteld.";return;}
    if($("email").value.trim()===credentials.email&&$("password").value===credentials.password)enterApp();else $("loginError").textContent="E-mail of wachtwoord klopt niet.";
  }catch(err){$("loginError").textContent="Inloggen mislukt. Controleer je Firebase Realtime Database.";}
});

$("logoutBtn").addEventListener("click",()=>{loggedIn=false;if(stopProductsListener){stopProductsListener();stopProductsListener=null;}mainScreen.classList.add("hidden");loginScreen.classList.remove("hidden");$("password").value="";checkSetup();});
function enterApp(){loggedIn=true;loginScreen.classList.add("hidden");mainScreen.classList.remove("hidden");if(stopProductsListener)stopProductsListener();stopProductsListener=onValue(ref(db,"products"),snap=>{products=snap.val()||{};renderAll();},()=>toast("Voorraad kon niet worden geladen."));renderAll();}

document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));btn.classList.add("active");$(btn.dataset.tab).classList.add("active");renderAll();}));
function renderAll(){if(!loggedIn)return;renderOrders();renderStock();renderSettings();renderHistory();}

function renderOrders(){
  const el=$("orders"),list=Object.entries(products);
  el.innerHTML=`<div class="page-head"><div><h1>Bestellen</h1><p class="muted">Kies een vast gewicht of voer zelf het aantal gram in. De bestelling wordt pas opgeslagen bij <b>Betaald</b>.</p></div></div>
  <div class="grid">${list.length?list.map(([id,p])=>{
    const qty=Number(p.stock||0),sold=qty<=0, opts=packageOptions(p);
    return `<article class="card order-card"><div class="product-name">${escapeHtml(p.name)}</div><p class="muted">${sold?"Niet beschikbaar":"Beschikbaar: "+amountLabel(p,qty)}</p><span class="badge ${sold?"out":"ok"}">${sold?"Uitverkocht":"Op voorraad"}</span>
      ${!sold?`<div class="order-form">
        ${p.unit==="grams"?`<label>Gewicht</label><div class="package-buttons">${opts.map((o,i)=>`<button type="button" class="package-btn" data-product="${id}" data-grams="${o.grams}" data-price="${o.price}">${o.grams} gram<br><small>${money(o.price)}</small></button>`).join("")}</div>`:""}
        <label>${p.unit==="grams"?"Of zelf gram invoeren":"Aantal"}</label>
        <input id="order-${id}" type="number" min="0.01" max="${qty}" step="${p.unit==="grams"?".01":"1"}" placeholder="${unitLabel(p)}">
        <input id="order-price-${id}" type="hidden">
        <div id="order-total-${id}" class="order-total">Totaal: ${money(0)}</div>
        <button class="primary full" onclick="window.payOrder('${id}')">Betaald</button>
      </div>`:""}</article>`}).join(""):`<div class="card empty">Nog geen producten. Maak er één aan bij Instellingen.</div>`}</div>`;
  document.querySelectorAll(".package-btn").forEach(btn=>btn.addEventListener("click",()=>{
    const id=btn.dataset.product,p=products[id],input=$("order-"+id),price=$("order-price-"+id);
    document.querySelectorAll(`.package-btn[data-product="${id}"]`).forEach(x=>x.classList.remove("selected"));btn.classList.add("selected");input.value=btn.dataset.grams;price.value=btn.dataset.price;updateOrderTotal(id);
  }));
  list.forEach(([id,p])=>{const input=$("order-"+id);if(input)input.addEventListener("input",()=>{$("order-price-"+id).value="";document.querySelectorAll(`.package-btn[data-product="${id}"]`).forEach(x=>x.classList.remove("selected"));updateOrderTotal(id);});});
}
function updateOrderTotal(id){
  const p=products[id],amount=Number($("order-"+id)?.value||0),fixed=Number($("order-price-"+id)?.value||0);
  let total=0;if(fixed>0)total=fixed;else total=amount*Number(p.price||0);
  const el=$("order-total-"+id);if(el)el.innerHTML=`Totaal: <strong>${money(total)}</strong>${p.unit==="grams"&&fixed<=0?` <small>(${money(p.price)} per gram)</small>`:""}`;
}
window.payOrder=async id=>{
  if(!loggedIn)return;const p=products[id],input=$("order-"+id);let amount=Number(input?.value),fixedPrice=Number($("order-price-"+id)?.value||0);
  if(!amount||amount<=0){toast("Vul een geldig gewicht/aantal in.");return;}
  if(p.unit==="count")amount=Math.floor(amount);
  if(amount>Number(p.stock||0)){toast("Niet genoeg voorraad.");return;}
  const total=fixedPrice>0?fixedPrice:amount*Number(p.price||0);
  if(!total&&total!==0){toast("Prijs is ongeldig.");return;}
  if(!confirm(`Betaling bevestigen voor ${amountLabel(p,amount)}?\nTotaal: ${money(total)}`))return;
  try{
    const result=await runTransaction(ref(db,`products/${id}/stock`),current=>{current=Number(current||0);if(current<amount)return;return current-amount;});
    if(!result.committed){toast("Niet genoeg voorraad.");return;}
    await set(push(ref(db,"history")),{productId:id,productName:p.name,unit:p.unit,amount,price:p.unit==="grams"&&fixedPrice>0?fixedPrice/amount:Number(p.price||0),total,soldAt:Date.now(),packagePrice:fixedPrice>0?fixedPrice:null});
    toast(`${amountLabel(p,amount)} betaald: ${money(total)}`);renderOrders();
  }catch(e){toast("Betaling opslaan mislukt. Controleer je database-regels.");}
};

function renderStock(){const el=$("stock"),list=Object.entries(products);el.innerHTML=`<div class="page-head"><div><h1>Voorraad</h1><p class="muted">Live overzicht van alle producten.</p></div></div><div class="grid">${list.length?list.map(([id,p])=>{const qty=Number(p.stock||0),max=Math.max(Number(p.stockMax||qty),qty,1),pct=Math.min(100,qty/max*100),status=qty<=0?"out":qty<max*.2?"low":"ok";return `<article class="card"><div class="product-name">${escapeHtml(p.name)}</div><div class="stock-value">${Number(qty).toLocaleString("nl-NL")}</div><div class="muted">${unitLabel(p)} over</div><div class="statbar"><i style="width:${pct}%"></i></div><div style="margin-top:13px"><span class="badge ${status}">${qty<=0?"Uitverkocht":status==="low"?"Bijna op":"Op voorraad"}</span></div></article>`}).join(""):`<div class="card empty">Geen voorraadproducten.</div>`}</div>`;}

function packageRowHtml(prefix,o={grams:"",price:0}){const x=priceParts(o.price);return `<div class="package-row"><div><label>Gram</label><input class="pkg-grams" type="number" min="0.01" step="0.01" value="${o.grams}"></div><div><label>Euro (€)</label><input class="pkg-euro" type="number" min="0" step="1" value="${x.euro}"></div><div><label>Cent</label><input class="pkg-cent" type="number" min="0" max="99" step="1" value="${x.cent}"></div><div><label>Milicent</label><input class="pkg-milicent" type="number" min="0" max="99" step="1" value="${String(x.milicent).padStart(2,"0")}"></div><button type="button" class="danger remove-package">Verwijderen</button></div>`;}
function collectPackageRows(containerId){return Array.from(document.querySelectorAll(`#${containerId} .package-row`)).map(r=>{const grams=Number(r.querySelector(".pkg-grams")?.value||0),e=Math.max(0,Math.floor(Number(r.querySelector(".pkg-euro")?.value||0))),c=Math.min(99,Math.max(0,Math.floor(Number(r.querySelector(".pkg-cent")?.value||0)))),m=Math.min(99,Math.max(0,Math.floor(Number(r.querySelector(".pkg-milicent")?.value||0))));return {grams,price:e+c/100+m/10000};}).filter(x=>x.grams>0&&x.price>=0);}
function bindPackageRows(){
  const addNew=$("addPackageRow"); if(addNew) addNew.onclick=()=>{const c=$("newPackagesRows");c.insertAdjacentHTML("beforeend",packageRowHtml("new",{}));bindPackageRows();};
  document.querySelectorAll(".add-package").forEach(btn=>btn.onclick=()=>{const c=$("packages-"+btn.dataset.product);c.insertAdjacentHTML("beforeend",packageRowHtml("pkg-new",{}));});
  document.querySelectorAll(".remove-package").forEach(btn=>btn.onclick=()=>{btn.closest(".package-row")?.remove();});
}
function renderSettings(){
  const el=$("settings"),list=Object.entries(products);
  el.innerHTML=`<div class="page-head"><div><h1>Instellingen</h1><p class="muted">Producten, voorraad en prijzen instellen.</p></div></div>
  <div class="card"><h2>Nieuw product</h2><form id="addProduct" class="add-form">
    <div><label>Naam</label><input id="newName" required placeholder="Bijv. Cashewnoten"></div><div><label>Eenheid</label><select id="newUnit"><option value="grams">Gram</option><option value="count">Aantal</option></select></div><div><label>Startvoorraad</label><input id="newStock" type="number" min="0" step=".01" required placeholder="0"></div><div><label>Prijs per gram/aantal (voor vrije invoer)</label>${priceInputs("newPrice",0)}</div>
    <div class="wide"><label>Vaste gewichten + prijs (alleen bij Gram)</label><div id="newPackagesRows" class="package-settings"></div><button type="button" class="ghost" id="addPackageRow">+ Gewicht toevoegen</button><small class="muted">Bijvoorbeeld 250 gram met €4 en 50 cent. Je kunt ook altijd zelf gram intypen bij Bestellen.</small></div><button class="primary" type="submit">+ Product</button></form></div><div style="height:18px"></div>
  <div class="grid">${list.length?list.map(([id,p])=>`<article class="card"><div class="product-name">${escapeHtml(p.name)}</div><div class="product-edit">
    <div><label>Naam</label><input id="name-${id}" value="${escapeHtml(p.name)}"></div><div><label>Eenheid</label><select id="unit-${id}"><option value="grams" ${p.unit==="grams"?"selected":""}>Gram</option><option value="count" ${p.unit==="count"?"selected":""}>Aantal</option></select></div><div><label>Voorraad nu</label><input id="stock-${id}" type="number" min="0" step=".01" value="${Number(p.stock||0)}"></div><div><label>Prijs per gram/aantal</label>${priceInputs(`price-${id}`,p.price)}</div><div class="wide"><label>Vaste gewichten + prijs</label><div id="packages-${id}" class="package-settings">${packageOptions(p).map((o,i)=>packageRowHtml(`pkg-${id}-${i}`,o)).join("")}</div><button type="button" class="ghost add-package" data-product="${id}">+ Gewicht toevoegen</button><small class="muted">Per gewicht stel je euro en cent apart in.</small></div><div><label>Toevoegen</label><input id="add-${id}" type="number" min="0" step=".01" placeholder="0"></div><button class="primary" onclick="window.saveProduct('${id}')">Opslaan</button></div><div class="actions"><button class="danger" onclick="window.deleteProduct('${id}')">Verwijderen</button></div></article>`).join(""):`<div class="card empty">Je hebt nog geen producten.</div>`}</div>`;
  $("addProduct").addEventListener("submit",async e=>{e.preventDefault();const name=$("newName").value.trim(),unit=$("newUnit").value,stock=Number($("newStock").value),price=readPrice("newPrice-euro","newPrice-cent","newPrice-milicent"),packageOptions=collectPackageRows("newPackagesRows");if(!name||stock<0||price<0)return;const id="p_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);try{await set(ref(db,`products/${id}`),{name,unit,stock,stockMax:stock,price,packageOptions:unit==="grams"?packageOptions:[],createdAt:Date.now()});e.target.reset();$("newPackagesRows").innerHTML="";toast("Product toegevoegd.");}catch(err){toast("Product toevoegen mislukt.");}});
  bindPackageRows();
}
window.saveProduct=async id=>{if(!loggedIn)return;const p=products[id];if(!p)return;let stock=Number($("stock-"+id).value),add=Number($("add-"+id).value||0),price=readPrice("price-"+id+"-euro","price-"+id+"-cent","price-"+id+"-milicent");const unit=$("unit-"+id).value;if(unit==="count"){stock=Math.floor(stock);add=Math.floor(add);}if(stock<0||add<0||price<0){toast("Gebruik geen negatieve waarden.");return;}const finalStock=stock+add;const packages=unit==="grams"?collectPackageRows("packages-"+id):[];try{await update(ref(db,`products/${id}`),{name:$("name-"+id).value.trim()||p.name,unit,price,stock:finalStock,stockMax:Math.max(Number(p.stockMax||0),finalStock),packageOptions:packages});toast("Product opgeslagen.");}catch(err){toast("Product opslaan mislukt.");}};

async function loadHistory(){const snap=await get(ref(db,"history"));historyEntries=snap.val()||{};}
function renderHistory(){
  const el=$("history");if(!el)return;
  loadHistory().then(()=>{const entries=Object.entries(historyEntries).sort((a,b)=>(b[1].soldAt||0)-(a[1].soldAt||0)),totalRevenue=entries.reduce((sum,[,e])=>sum+Number(e.total||0),0),soldByProduct={};entries.forEach(([,e])=>{const key=e.productId||e.productName||"onbekend";if(!soldByProduct[key])soldByProduct[key]={name:e.productName||"Onbekend product",unit:e.unit||"count",amount:0,revenue:0};soldByProduct[key].amount+=Number(e.amount||0);soldByProduct[key].revenue+=Number(e.total||0);});
    const maxPossibleRevenue=Object.values(products).reduce((sum,p)=>{const stock=Math.max(0,Number(p.stock||0));if(p.unit==="grams"){const rates=[Number(p.price||0),...packageOptions(p).filter(o=>Number(o.grams)>0).map(o=>Number(o.price||0)/Number(o.grams))];return sum+stock*Math.max(0,...rates);}return sum+stock*Math.max(0,Number(p.price||0));},0);
    const remainingPotential=Math.max(0,maxPossibleRevenue-totalRevenue);
    el.innerHTML=`<div class="page-head"><div><h1>Historie</h1><p class="muted">Alle betaalde verkopen.</p></div><button class="danger" ${entries.length?"":"disabled"} onclick="window.clearHistory()">Historie wissen</button></div><div class="history-list">${entries.length?entries.map(([key,e])=>`<article class="card history-item"><div><div class="product-name">${escapeHtml(e.productName||"Onbekend product")}</div><div class="muted">${amountLabel(e,e.amount)} × ${money(e.price||0)} per gram/aantal</div></div><strong>${money(e.total||0)}</strong><small class="muted">${e.soldAt?new Date(e.soldAt).toLocaleString("nl-NL"):"-"}</small><button class="ghost small-btn" onclick="window.deleteHistoryEntry('${key}')">Verwijderen</button></article>`).join(""):`<div class="card empty">Nog geen verkochte producten.</div>`}</div><div class="card history-total"><h2>Totaal</h2><div class="revenue">${money(totalRevenue)}</div><p class="muted">Totale omzet</p><div class="history-max"><div><strong>Maximale omzet</strong><span>${money(maxPossibleRevenue)}</span></div><div><strong>Maximaal nog te verdienen</strong><span>${money(remainingPotential)}</span></div></div><p class="muted small-note">Gebaseerd op de huidige voorraad en de hoogste ingestelde opbrengst per gram/aantal.</p><div class="divider"></div><h3>Aantal verkocht per product</h3><div class="summary-grid">${Object.values(soldByProduct).length?Object.values(soldByProduct).map(x=>`<div class="summary-item"><span>${escapeHtml(x.name)}</span><strong>${Number(x.amount).toLocaleString("nl-NL")} ${unitLabel(x)}</strong><small>${money(x.revenue)}</small></div>`).join(""):`<div class="muted">Nog geen verkopen.</div>`}</div></div>`;
  }).catch(()=>{el.innerHTML=`<div class="card empty">Historie kon niet worden geladen.</div>`;});
}
window.deleteHistoryEntry=async key=>{if(!loggedIn||!confirm("Deze verkoop uit de historie verwijderen? Dit wijzigt de voorraad niet."))return;try{await remove(ref(db,`history/${key}`));toast("Verkoop uit historie verwijderd.");renderHistory();}catch(e){toast("Verwijderen mislukt.");}};
window.clearHistory=async()=>{if(!loggedIn||!confirm("Weet je zeker dat je de volledige historie wilt verwijderen? Dit wijzigt de voorraad niet."))return;try{await remove(ref(db,"history"));historyEntries={};toast("Historie gewist.");renderHistory();}catch(e){toast("Historie wissen mislukt.");}};
window.deleteProduct=async id=>{if(!loggedIn)return;if(!confirm("Dit product verwijderen?"))return;try{await set(ref(db,`products/${id}`),null);toast("Product verwijderd.");}catch(err){toast("Product verwijderen mislukt.");}};

checkSetup();
