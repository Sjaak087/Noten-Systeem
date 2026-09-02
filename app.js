import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, onValue, runTransaction
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyARcchN-X8stS7MoD_Vo2uky9gULbaOKsQ",
  authDomain: "website-e9a77.firebaseapp.com",
  databaseURL: "https://website-e9a77-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "website-e9a77",
  storageBucket: "website-e9a77.firebasestorage.app",
  messagingSenderId: "1067889683631",
  appId: "1:1067889683631:web:1bb1c652719a93a66df85a",
  measurementId: "G-GTMM66S7FB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = id => document.getElementById(id);
const loginScreen = $("loginScreen"), mainScreen = $("mainScreen");
let products = {};
let stopProductsListener = null;

function toast(message){
  const el=$("toast"); el.textContent=message; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2200);
}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function unitLabel(p){return p.unit==="grams"?"gram":"aantal";}
function amountLabel(p,v){return `${Number(v||0).toLocaleString("nl-NL")} ${unitLabel(p)}`;}

async function checkSetup(){
  try{
    const snap=await get(ref(db,"appSetup"));
    if(!snap.exists() || snap.val()?.configured !== true){
      $("setupNotice").classList.remove("hidden");
      $("setupNotice").textContent="Dit is de eerste keer. Maak hieronder het vaste account aan.";
      $("loginForm").classList.add("hidden"); $("setupForm").classList.remove("hidden");
    }
  }catch(e){ $("loginError").textContent="Kan Firebase niet bereiken. Controleer je database-regels."; }
}

$("setupForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("setupError").textContent="";
  const email=$("setupEmail").value.trim(), p1=$("setupPassword").value, p2=$("setupPassword2").value;
  if(p1!==p2){$("setupError").textContent="De wachtwoorden zijn niet hetzelfde.";return;}
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,p1);
    await set(ref(db,"appSetup"),{configured:true,email,createdAt:Date.now()});
    toast("Account aangemaakt.");
  }catch(err){$("setupError").textContent=friendlyAuthError(err);}
});

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("loginError").textContent="";
  try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);}
  catch(err){$("loginError").textContent=friendlyAuthError(err);}
});
$("logoutBtn").addEventListener("click",()=>signOut(auth));

function friendlyAuthError(e){
  const c=e?.code||"";
  if(c.includes("invalid-credential")||c.includes("wrong-password")) return "E-mail of wachtwoord klopt niet.";
  if(c.includes("email-already-in-use")) return "Dit e-mailadres bestaat al.";
  if(c.includes("weak-password")) return "Gebruik minimaal 6 tekens voor het wachtwoord.";
  return "Er ging iets mis. Probeer opnieuw.";
}

document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active"); $(btn.dataset.tab).classList.add("active");
  renderAll();
}));

onAuthStateChanged(auth,user=>{
  if(user){
    loginScreen.classList.add("hidden"); mainScreen.classList.remove("hidden");
    if(stopProductsListener) stopProductsListener();
    stopProductsListener=onValue(ref(db,"products"),snap=>{products=snap.val()||{};renderAll();});
  }else{
    mainScreen.classList.add("hidden"); loginScreen.classList.remove("hidden");
    checkSetup();
  }
});

function renderAll(){renderOrders();renderStock();renderSettings();}

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
  const p=products[id], input=$(`order-${id}`); let amount=Number(input.value);
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
  }catch(e){toast("Bestellen mislukt.");}
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
    await set(ref(db,`products/${id}`),{name,unit,stock,stockMax:stock,createdAt:Date.now()});
    e.target.reset();toast("Product toegevoegd.");
  });
}

window.saveProduct=async id=>{
  const p=products[id]; if(!p)return;
  let stock=Number($(`stock-${id}`).value), add=Number($(`add-${id}`).value||0);
  if(p.unit==="count"){stock=Math.floor(stock);add=Math.floor(add);}
  if(stock<0||add<0){toast("Gebruik geen negatieve voorraad.");return;}
  const finalStock=stock+add;
  await update(ref(db,`products/${id}`),{
    name:$(`name-${id}`).value.trim()||p.name,
    unit:$(`unit-${id}`).value,
    stock:finalStock,
    stockMax:Math.max(Number(p.stockMax||0),finalStock)
  });
  toast("Product opgeslagen.");
};
window.deleteProduct=async id=>{
  if(!confirm("Dit product verwijderen?"))return;
  await set(ref(db,`products/${id}`),null);toast("Product verwijderd.");
};
