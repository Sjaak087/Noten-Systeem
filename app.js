import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, onValue, runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const $ = id => document.getElementById(id);
const loginScreen = $("loginScreen"), mainScreen = $("mainScreen");
let products = {};
let stopProductsListener = null;
let loggedIn = false;

function toast(message){
  const el=$("toast"); el.textContent=message; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2200);
}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function unitLabel(p){return p.unit==="grams"?"gram":"aantal";}
function amountLabel(p,v){return `${Number(v||0).toLocaleString("nl-NL")} ${unitLabel(p)}`;}

async function loadCredentials(){
  const snap = await get(ref(db,"credentials"));
  return snap.exists() ? snap.val() : null;
}

async function checkSetup(){
  try{
    const credentials = await loadCredentials();
    if(!credentials || credentials.configured !== true){
      $("setupNotice").classList.remove("hidden");
      $("setupNotice").textContent="Dit is de eerste keer. Maak hieronder het vaste account aan.";
      $("loginForm").classList.add("hidden");
      $("setupForm").classList.remove("hidden");
    }else{
      $("setupNotice").classList.add("hidden");
      $("loginForm").classList.remove("hidden");
      $("setupForm").classList.add("hidden");
    }
  }catch(e){
    $("loginError").textContent="Kan Firebase niet bereiken. Controleer of je Realtime Database toegankelijk is.";
  }
}

$("setupForm").addEventListener("submit",async e=>{
  e.preventDefault();
  $("setupError").textContent="";
  const email=$("setupEmail").value.trim(), p1=$("setupPassword").value, p2=$("setupPassword2").value;
  if(!email || !email.includes("@")){ $("setupError").textContent="Vul een geldig e-mailadres in."; return; }
  if(p1.length < 1){ $("setupError").textContent="Vul een wachtwoord in."; return; }
  if(p1!==p2){$("setupError").textContent="De wachtwoorden zijn niet hetzelfde.";return;}
  try{
    const existing = await loadCredentials();
    if(existing?.configured === true){
      $("setupError").textContent="Er is al een account ingesteld. Log daarmee in.";
      await checkSetup();
      return;
    }
    await set(ref(db,"credentials"),{
      configured:true,
      email,
      password:p1,
      createdAt:Date.now()
    });
    $("setupForm").reset();
    await checkSetup();
    toast("Account aangemaakt.");
  }catch(err){
    $("setupError").textContent="Account opslaan mislukt. Controleer je Firebase Realtime Database.";
  }
});

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  $("loginError").textContent="";
  try{
    const credentials = await loadCredentials();
    if(!credentials || credentials.configured !== true){
      await checkSetup();
      $("loginError").textContent="Er is nog geen account ingesteld.";
      return;
    }
    const email=$("email").value.trim();
    const password=$("password").value;
    if(email === credentials.email && password === credentials.password){
      enterApp();
    }else{
      $("loginError").textContent="E-mail of wachtwoord klopt niet.";
    }
  }catch(err){
    $("loginError").textContent="Inloggen mislukt. Controleer je Firebase Realtime Database.";
  }
});

$("logoutBtn").addEventListener("click",()=>{
  loggedIn=false;
  if(stopProductsListener){stopProductsListener();stopProductsListener=null;}
  mainScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  $("password").value="";
  checkSetup();
});

function enterApp(){
  loggedIn=true;
  loginScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
  if(stopProductsListener) stopProductsListener();
  stopProductsListener=onValue(ref(db,"products"),snap=>{
    products=snap.val()||{};
    renderAll();
  },()=>toast("Voorraad kon niet worden geladen."));
  renderAll();
}

document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active"); $(btn.dataset.tab).classList.add("active");
  renderAll();
}));

function renderAll(){if(!loggedIn)return;renderOrders();renderStock();renderSettings();}

function renderOrders(){
  const el=$("orders"), list=Object.entries(products);
  el.innerHTML=`<div class="page-head"><div><h1>Bestellen</h1><p class="muted">Bestel voorraad en trek automatisch de voorraad af.</p></div></div>
  <div class="grid">${list.length?list.map(([id,p])=>{
    const qty=Number(p.stock||0), sold=qty<=0;
    return `<article class="card">
      <div class="product-name">${escapeHtml(p.name)}</div>
      <p class="muted">${sold?"Niet beschikbaar":"Beschikbaar: "+amountLabel(p,qty)}</p>
      <span class="badge ${sold?"out":"ok"}">${sold?"Uitverkocht":"Op voorraad"}</span>
      <div class="order-row">${sold?"":`<input id="order-${id}" type="number" min="0.01" step="${p.unit==="grams"?".01":"1"}" placeholder="${unitLabel(p)}"><button class="primary" onclick="window.placeOrder('${id}')">Bestellen</button>`}</div>
    </article>`}).join(""):`<div class="card empty">Nog geen producten. Maak er één aan bij Instellingen.</div>`}</div>`;
}

window.placeOrder=async id=>{
  if(!loggedIn)return;
  const p=products[id], input=$(`order-${id}`); let amount=Number(input?.value);
  if(!amount||amount<=0){toast("Vul een geldig aantal in.");return;}
  if(p.unit==="count") amount=Math.floor(amount);
  const productRef=ref(db,`products/${id}/stock`);
  try{
    const result=await runTransaction(productRef,current=>{
      current=Number(current||0);
      if(current<amount)return;
      return current-amount;
    });
    if(result.committed){toast(`${amountLabel(p,amount)} besteld.`);}
    else toast("Niet genoeg voorraad.");
  }catch(e){toast("Bestellen mislukt. Controleer je database-regels.");}
};

function renderStock(){
  const el=$("stock"), list=Object.entries(products);
  el.innerHTML=`<div class="page-head"><div><h1>Voorraad</h1><p class="muted">Live overzicht van alle producten.</p></div></div>
  <div class="grid">${list.length?list.map(([id,p])=>{
    const qty=Number(p.stock||0), max=Math.max(Number(p.stockMax||qty),qty,1), pct=Math.min(100,qty/max*100);
    const status=qty<=0?"out":qty<max*.2?"low":"ok";
    return `<article class="card"><div class="product-name">${escapeHtml(p.name)}</div>
      <div class="stock-value">${Number(qty).toLocaleString("nl-NL")}</div>
      <div class="muted">${unitLabel(p)} over</div>
      <div class="statbar"><i style="width:${pct}%"></i></div>
      <div style="margin-top:13px"><span class="badge ${status}">${qty<=0?"Uitverkocht":status==="low"?"Bijna op":"Op voorraad"}</span></div>
    </article>`}).join(""):`<div class="card empty">Geen voorraadproducten.</div>`}</div>`;
}

function renderSettings(){
  const el=$("settings"), list=Object.entries(products);
  el.innerHTML=`<div class="page-head"><div><h1>Instellingen</h1><p class="muted">Producten toevoegen, voorraad aanvullen en gegevens wijzigen.</p></div></div>
  <div class="card"><h2>Nieuw product</h2>
    <form id="addProduct" class="add-form">
      <div><label>Naam</label><input id="newName" required placeholder="Bijv. Koffie"></div>
      <div><label>Eenheid</label><select id="newUnit"><option value="grams">Gram</option><option value="count">Aantal</option></select></div>
      <div><label>Startvoorraad</label><input id="newStock" type="number" min="0" step=".01" required placeholder="0"></div>
      <button class="primary" type="submit">+ Product</button>
    </form>
  </div>
  <div style="height:18px"></div>
  <div class="grid">${list.length?list.map(([id,p])=>`<article class="card">
    <div class="product-name">${escapeHtml(p.name)}</div>
    <div class="product-edit">
      <div><label>Naam</label><input id="name-${id}" value="${escapeHtml(p.name)}"></div>
      <div><label>Eenheid</label><select id="unit-${id}"><option value="grams" ${p.unit==="grams"?"selected":""}>Gram</option><option value="count" ${p.unit==="count"?"selected":""}>Aantal</option></select></div>
      <div><label>Voorraad nu</label><input id="stock-${id}" type="number" min="0" step=".01" value="${Number(p.stock||0)}"></div>
      <div><label>Toevoegen</label><input id="add-${id}" type="number" min="0" step=".01" placeholder="0"></div>
      <button class="primary" onclick="window.saveProduct('${id}')">Opslaan</button>
    </div>
    <div class="actions"><button class="danger" onclick="window.deleteProduct('${id}')">Verwijderen</button></div>
  </article>`).join(""):`<div class="card empty">Je hebt nog geen producten.</div>`}</div>`;

  $("addProduct").addEventListener("submit",async e=>{
    e.preventDefault();
    const name=$("newName").value.trim(), unit=$("newUnit").value, stock=Number($("newStock").value);
    if(!name||stock<0)return;
    const id="p_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
    try{
      await set(ref(db,`products/${id}`),{name,unit,stock,stockMax:stock,createdAt:Date.now()});
      e.target.reset();toast("Product toegevoegd.");
    }catch(err){toast("Product toevoegen mislukt.");}
  });
}

window.saveProduct=async id=>{
  if(!loggedIn)return;
  const p=products[id]; if(!p)return;
  let stock=Number($(`stock-${id}`).value), add=Number($(`add-${id}`).value||0);
  const unit=$(`unit-${id}`).value;
  if(unit==="count"){stock=Math.floor(stock);add=Math.floor(add);}
  if(stock<0||add<0){toast("Gebruik geen negatieve voorraad.");return;}
  const finalStock=stock+add;
  try{
    await update(ref(db,`products/${id}`),{
      name:$(`name-${id}`).value.trim()||p.name,
      unit,
      stock:finalStock,
      stockMax:Math.max(Number(p.stockMax||0),finalStock)
    });
    toast("Product opgeslagen.");
  }catch(err){toast("Product opslaan mislukt.");}
};

window.deleteProduct=async id=>{
  if(!loggedIn)return;
  if(!confirm("Dit product verwijderen?"))return;
  try{await set(ref(db,`products/${id}`),null);toast("Product verwijderd.");}
  catch(err){toast("Product verwijderen mislukt.");}
};

checkSetup();
