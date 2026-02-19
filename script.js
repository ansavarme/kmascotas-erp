// --- IMPORTAR FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, addDoc, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- TUS LLAVES ---
const firebaseConfig = {
  apiKey: "AIzaSyAQhj2Ad4uxKC1jXWRRoQfR17Gza38QLio",
  authDomain: "kmascotas-db.firebaseapp.com",
  projectId: "kmascotas-db",
  storageBucket: "kmascotas-db.firebasestorage.app",
  messagingSenderId: "496521966317",
  appId: "1:496521966317:web:0a8450b1d32125d9b292e4",
  measurementId: "G-YH6FENK3DL"
};

// INICIALIZAR
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// CONSTANTES
const META_GLOBAL = 380;
const SIZES = ['sq-p', 'sq-m', 'sq-pit', 'sq-xl', 'rd-p', 'rd-m', 'rd-pit', 'rd-xl'];
const GOALS = {
    'cob-sq-p': 50, 'cob-sq-m': 50, 'cob-sq-pit': 50,
    'anti-sq-p': 50, 'anti-sq-m': 50, 'anti-sq-pit': 50,
    'pel-sq-p': 20, 'pel-sq-m': 30, 'pel-sq-pit': 30
};

// CACHÉ
let currentDataCache = { cuts: {}, liners: {}, fin: {} };
let historyDataCache = [];
let isLocalChange = false;

window.onload = () => {
    const dateInput = document.getElementById('production-date');
    if(dateInput && !dateInput.value) dateInput.valueAsDate = new Date();
    
    // Listener cambio de fecha
    dateInput.addEventListener('change', handleDateChange);

    listenToCurrentData();
    listenToHistory();
};

// --- FUNCIÓN ESCOBA: BORRA VISUALMENTE TODO ---
function clearLocalUI() {
    const inputs = document.querySelectorAll('input[type="number"]');
    inputs.forEach(i => i.value = ""); // Vaciar visualmente
    
    // Vaciar memoria caché
    currentDataCache = { cuts: {}, liners: {}, fin: {} };
    
    // Actualizar totales visuales a 0 (ESTA ERA LA FUNCIÓN QUE FALTABA)
    updateDashboard();
}

// --- LÓGICA DE CAMBIO DE FECHA ---
async function handleDateChange() {
    // 1. Borrar visualmente INMEDIATAMENTE
    clearLocalUI();

    // 2. Limpiar en la nube (silenciosamente)
    try {
        await setDoc(doc(db, "produccion_diaria", "estado_actual"), { cuts: {}, liners: {}, fin: {} });
    } catch(e) { console.error("Error limpiando nube:", e); }
}

// --- ESCUCHAS ---
function listenToCurrentData() {
    onSnapshot(doc(db, "produccion_diaria", "estado_actual"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentDataCache = data;
            // Solo actualizamos si NO estamos escribiendo nosotros
            if (!isLocalChange) updateInputsFromCloud(data);
            updateDashboard();
        } else {
            saveCurrentStateToCloud(); 
        }
    });
}

function listenToHistory() {
    const q = query(collection(db, "historial"), orderBy("date", "asc"));
    onSnapshot(q, (querySnapshot) => {
        historyDataCache = [];
        querySnapshot.forEach((doc) => {
            historyDataCache.push({ id: doc.id, ...doc.data() });
        });
        updateDashboard();
        renderHistoryTable();
    });
}

// --- GUARDADO AUTOMÁTICO ---
let saveTimeout;
document.addEventListener('input', (e) => {
    if(e.target.tagName === 'INPUT' && e.target.type === 'number') {
        isLocalChange = true;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveCurrentStateToCloud();
            isLocalChange = false;
        }, 800);
        updateLocalCacheFromInputs();
        updateDashboard();
    }
});

function updateLocalCacheFromInputs() {
    ['cob', 'anti', 'pel', 'htr'].forEach(m => SIZES.forEach(s => currentDataCache.cuts[`${m}-${s}`] = val(`cut-${m}-${s}`)));
    ['taf', 'cod'].forEach(l => SIZES.forEach(s => currentDataCache.liners[`${l}-${s}`] = val(`lin-${l}-${s}`)));
    ['p','m','pit'].forEach(s => currentDataCache.liners[`taf-cap-${s}`] = val(`lin-taf-cap-${s}`));
    ['cob', 'anti', 'pelcod', 'peltaf', 'encap', 'htr'].forEach(cat => SIZES.forEach(s => currentDataCache.fin[`${cat}-${s}`] = val(`fin-${cat}-${s}`)));
}

async function saveCurrentStateToCloud() {
    updateLocalCacheFromInputs();
    try {
        await setDoc(doc(db, "produccion_diaria", "estado_actual"), currentDataCache);
    } catch (e) { console.error(e); }
}

function updateInputsFromCloud(data) {
    const allInputs = document.querySelectorAll('input[type="number"]');
    allInputs.forEach(input => {
        const parts = input.id.split('-');
        if(parts.length < 2) return;
        const prefix = parts[0]; 
        const key = parts.slice(1).join('-'); 

        let val = '';
        if (prefix === 'cut' && data.cuts && data.cuts[key]) val = data.cuts[key];
        if (prefix === 'lin' && data.liners && data.liners[key]) val = data.liners[key];
        if (prefix === 'fin' && data.fin && data.fin[key]) val = data.fin[key];

        if(input.value != val) input.value = val;
    });
}

// --- DASHBOARD (ESTA ES LA QUE FALTABA) ---
function updateDashboard() {
    const merged = mergeData(historyDataCache, currentDataCache);

    renderList('dash-cuts-list', merged.cuts, 'cut');
    renderList('dash-liners-list', merged.liners, 'lin');
    renderList('dash-fin-list', merged.fin, 'fin');

    const tot = Object.values(merged.fin||{}).reduce((a,b)=>a+b,0);
    const p = Math.min((tot/META_GLOBAL)*100, 100);
    const bar = document.getElementById('global-bar'); if(bar) bar.style.width=`${p}%`;
    const txt = document.getElementById('global-text'); if(txt) txt.innerText=`${tot} / ${META_GLOBAL} (${Math.round(p)}%)`;
    const tday = document.getElementById('total-today-display');
    if(tday) tday.innerText = Object.values(currentDataCache.fin||{}).reduce((a,b)=>a+b,0);
}

// --- ACCIONES PRINCIPALES ---

window.saveDay = async function() {
    updateLocalCacheFromInputs();
    const totalToday = Object.values(currentDataCache.fin || {}).reduce((a,b)=>a+b,0);
    const totalActivity = totalToday + Object.values(currentDataCache.cuts||{}).reduce((a,b)=>a+b,0) + Object.values(currentDataCache.liners||{}).reduce((a,b)=>a+b,0);
    
    if(totalActivity === 0 && !confirm("¿Guardar día vacío?")) return;

    const entry = {
        date: document.getElementById('production-date').value,
        total: totalToday,
        cuts: currentDataCache.cuts || {},
        liners: currentDataCache.liners || {},
        fin: currentDataCache.fin || {}
    };

    try {
        await addDoc(collection(db, "historial"), entry);
        
        // BORRADO VISUAL + NUBE
        clearLocalUI();
        await setDoc(doc(db, "produccion_diaria", "estado_actual"), { cuts: {}, liners: {}, fin: {} });
        
        alert("✅ Día guardado correctamente.");
    } catch (e) {
        alert("Error al guardar: " + e.message);
    }
};

window.editDay = async function(docId) {
    const dayData = historyDataCache.find(d => d.id === docId);
    if(!dayData || !confirm(`¿Editar ${dayData.date}?`)) return;

    try {
        await setDoc(doc(db, "produccion_diaria", "estado_actual"), {
            cuts: dayData.cuts, liners: dayData.liners, fin: dayData.fin
        });
        
        const dateInput = document.getElementById('production-date');
        dateInput.removeEventListener('change', handleDateChange);
        dateInput.value = dayData.date;
        setTimeout(() => dateInput.addEventListener('change', handleDateChange), 1000);

        await deleteDoc(doc(db, "historial", docId));
        alert("Datos cargados. Realiza los cambios y vuelve a 'Cerrar Día'.");
        window.scrollTo(0,0);
    } catch(e) { alert("Error: " + e.message); }
};

window.resetAll = async function() {
    const confirmWord = prompt("⚠️ ¿ARCHIVAR SEMANA?\n\nEscribe 'ARCHIVAR' para reiniciar:");
    if (confirmWord === 'ARCHIVAR') {
        try {
            await addDoc(collection(db, "semanas_cerradas"), {
                fecha: new Date().toISOString(),
                data: historyDataCache
            });
            clearLocalUI();
            await setDoc(doc(db, "produccion_diaria", "estado_actual"), { cuts: {}, liners: {}, fin: {} });
            const deletePromises = historyDataCache.map(item => deleteDoc(doc(db, "historial", item.id)));
            await Promise.all(deletePromises);
            alert("✅ Semana archivada y reiniciada.");
        } catch (e) { alert("Error al archivar."); }
    }
};

// --- VISUALES ---
window.toggleDash = function() { const c = document.getElementById('dash-content'); c.style.display = c.style.display==='none'?'grid':'none'; };
window.generateSmartReport = function() {
    const merged = mergeData(historyDataCache, currentDataCache);
    let csv = `REPORTE V21 - ${new Date().toLocaleDateString()}\n\nSECCION,DETALLE,CANTIDAD\n`;
    const add = (t, o) => { if(o) for(const [k,v] of Object.entries(o)) if(v>0) csv+=`${t},${formatLabel(k)},${v}\n`; };
    add('CORTE', merged.cuts); add('FORROS', merged.liners); add('CONFECCION', merged.fin);
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = `Reporte_${Date.now()}.csv`;
    link.click();
};

const val = (id) => parseInt(document.getElementById(id)?.value) || 0;
const formatLabel = (key) => {
    const parts = key.split('-');
    if(parts.length < 3) return key;
    let mat = parts[0].toUpperCase();
    if(mat === 'PELCOD') mat = 'PEL-COD';
    if(mat === 'PELTAF') mat = 'PEL-TAF';
    if(parts[0] === 'taf' && parts[1] === 'cap') return `MOLDE ENCAP ${parts[2].toUpperCase()}`;
    let shape = parts[1] === 'sq' ? 'CUA' : (parts[1] === 'rd' ? 'RED' : 'ENCAP');
    let size = parts[2].toUpperCase();
    return `${mat} ${shape} ${size}`;
};

function renderList(cid, obj, type) {
    const c = document.getElementById(cid); if(!c)return; c.innerHTML='';
    const getGoal = (k, t) => {
        if (t === 'lin') {
            const p = k.split('-');
            if(p[0]==='taf' && p[1]==='sq') return (GOALS[`cob-${p[1]}-${p[2]}`]||0)+(GOALS[`anti-${p[1]}-${p[2]}`]||0);
            if(p[0]==='cod' && p[1]==='sq') return (GOALS[`pel-${p[1]}-${p[2]}`]||0);
            return 0;
        }
        let lk = k;
        if(k.startsWith('pelcod')||k.startsWith('peltaf')) lk=k.replace('pelcod','pel').replace('peltaf','pel');
        return GOALS[lk]||0;
    };
    if(obj) for(const [k,v] of Object.entries(obj)) {
        const g = getGoal(k,type);
        if(v>0 || g>0) {
            let trk = '', valTxt = g>0 ? `${v} / ${g}` : `${v} <span style='font-size:0.7rem;color:#3b82f6'>(Extra)</span>`;
            if(g>0) { let p=Math.round((v/g)*100); trk=`<div class="mini-track"><div class="mini-fill ${p>=100?'green':'yellow'}" style="width:${Math.min(p,100)}%"></div></div>`; }
            else { trk=`<div class="mini-track"><div class="mini-fill blue" style="width:100%"></div></div>`; }
            const r = document.createElement('div'); r.className='stat-row';
            r.innerHTML = `<div class="stat-header"><span class="stat-name">${formatLabel(k)}</span><span class="stat-val">${valTxt}</span></div>${trk}`;
            c.appendChild(r);
        }
    }
}

function renderHistoryTable() {
    const b = document.getElementById('history-body'); if(!b)return;
    const tag = (o) => { let t=[]; if(o)for(const [k,v] of Object.entries(o)) if(v>0) t.push(`<b>${v}</b> ${formatLabel(k)}`); return t.join(', '); };
    b.innerHTML = historyDataCache.map(d => {
        let h = "";
        const c=tag(d.cuts), l=tag(d.liners), f=tag(d.fin);
        if(c) h+=`<div class="hist-block hist-cut"><span class="hist-label">✂️ Corte:</span><span class="hist-content">${c}</span></div>`;
        if(l) h+=`<div class="hist-block hist-lin"><span class="hist-label">🧵 Forros:</span><span class="hist-content">${l}</span></div>`;
        if(f) h+=`<div class="hist-block hist-fin"><span class="hist-label">👕 Conf:</span><span class="hist-content">${f}</span></div>`;
        if(!h) h="<em style='color:#cbd5e1'>-</em>";
        return `<tr><td style="font-weight:bold;color:#1e293b">${d.date}</td><td style="text-align:center;font-size:1.1rem;color:var(--primary)">${d.total}</td><td>${h}</td><td><button class="btn-edit" onclick="editDay('${d.id}')"><i class="fas fa-pen"></i> Editar</button></td></tr>`;
    }).join('');
}

function mergeData(h, c) {
    const m = { cuts: {}, liners: {}, fin: {} };
    const add = (s) => { ['cuts','liners','fin'].forEach(cat => { if(s && s[cat]) for(const [k,v] of Object.entries(s[cat])) m[cat][k]=(m[cat][k]||0)+v; }); };
    h.forEach(add); add(c); return m;
}
