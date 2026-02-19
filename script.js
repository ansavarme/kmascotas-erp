// --- IMPORTAR FIREBASE DESDE LA NUBE (CDN) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, addDoc, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- TUS LLAVES DE SEGURIDAD (Tomadas de tu imagen) ---
const firebaseConfig = {
  apiKey: "AIzaSyAQhj2Ad4uxKC1jXWRRoQfR17Gza38QLio",
  authDomain: "kmascotas-db.firebaseapp.com",
  projectId: "kmascotas-db",
  storageBucket: "kmascotas-db.firebasestorage.app",
  messagingSenderId: "496521966317",
  appId: "1:496521966317:web:0a8450b1d32125d9b292e4",
  measurementId: "G-YH6FENK3DL"
};

// INICIALIZAR LA NUBE
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

// VARIABLES GLOBALES PARA DATOS
let currentDataCache = { cuts: {}, liners: {}, fin: {} };
let historyDataCache = [];
let isLocalChange = false; // Para evitar bucles de actualización

// AL CARGAR
window.onload = () => {
    // Configurar fecha hoy
    const dateInput = document.getElementById('production-date');
    if(dateInput && !dateInput.value) dateInput.valueAsDate = new Date();
    
    // INICIAR ESCUCHAS EN TIEMPO REAL
    listenToCurrentData();
    listenToHistory();
};

// --- ESCUCHAR DATOS ACTUALES (INPUTS) ---
function listenToCurrentData() {
    // Escucha el documento 'estado_actual' en la colección 'produccion_diaria'
    onSnapshot(doc(db, "produccion_diaria", "estado_actual"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentDataCache = data; // Actualizar caché
            
            // Si el cambio NO vino de nosotros escribiendo ahora mismo, actualizamos los inputs
            if (!isLocalChange) {
                updateInputsFromCloud(data);
            }
            // Siempre actualizamos el dashboard
            updateDashboard();
        } else {
            // Si no existe (primera vez), lo creamos vacío
            saveToCloud({}, true);
        }
    });
}

// --- ESCUCHAR HISTORIAL ---
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

// --- FUNCIONES DE GUARDADO (DEBOUNCE) ---
let saveTimeout;
// Escuchar inputs del usuario
document.addEventListener('input', (e) => {
    if(e.target.tagName === 'INPUT' && e.target.type === 'number') {
        isLocalChange = true; // Marcamos que estamos escribiendo
        clearTimeout(saveTimeout);
        
        // Esperamos 1 segundo después de que dejes de escribir para enviar a la nube
        saveTimeout = setTimeout(() => {
            saveCurrentStateToCloud();
            isLocalChange = false; // Liberamos
        }, 800);
        
        // Actualizamos dashboard visualmente de inmediato para que se sienta rápido
        updateLocalCacheFromInputs();
        updateDashboard();
    }
});

function updateLocalCacheFromInputs() {
    // Actualizamos el objeto caché con lo que hay en pantalla
    ['cob', 'anti', 'pel', 'htr'].forEach(m => SIZES.forEach(s => currentDataCache.cuts[`${m}-${s}`] = val(`cut-${m}-${s}`)));
    ['taf', 'cod'].forEach(l => SIZES.forEach(s => currentDataCache.liners[`${l}-${s}`] = val(`lin-${l}-${s}`)));
    ['p','m','pit'].forEach(s => currentDataCache.liners[`taf-cap-${s}`] = val(`lin-taf-cap-${s}`));
    ['cob', 'anti', 'pelcod', 'peltaf', 'encap', 'htr'].forEach(cat => SIZES.forEach(s => currentDataCache.fin[`${cat}-${s}`] = val(`fin-${cat}-${s}`)));
}

async function saveCurrentStateToCloud() {
    updateLocalCacheFromInputs();
    try {
        await setDoc(doc(db, "produccion_diaria", "estado_actual"), currentDataCache);
        console.log("Guardado en nube");
    } catch (e) {
        console.error("Error guardando:", e);
    }
}

// --- ACTUALIZAR UI DESDE NUBE ---
function updateInputsFromCloud(data) {
    const safeVal = (obj, key) => (obj && obj[key]) ? obj[key] : '';
    
    // Cuts
    if(data.cuts) Object.keys(data.cuts).forEach(k => {
        const el = document.getElementById(`cut-${k}`);
        if(el) el.value = safeVal(data.cuts, k);
    });
    // Liners
    if(data.liners) Object.keys(data.liners).forEach(k => {
        let id = `lin-${k}`;
        if(k.startsWith('taf-cap')) id = `lin-${k}`; // corrección ID
        const el = document.getElementById(id);
        if(el) el.value = safeVal(data.liners, k);
    });
    // Fin
    if(data.fin) Object.keys(data.fin).forEach(k => {
        const el = document.getElementById(`fin-${k}`);
        if(el) el.value = safeVal(data.fin, k);
    });
}

// --- DASHBOARD Y VISUALIZACIÓN ---
function updateDashboard() {
    // Fusionar historial + datos actuales
    const merged = mergeData(historyDataCache, currentDataCache);

    renderList('dash-cuts-list', merged.cuts, 'cut');
    renderList('dash-liners-list', merged.liners, 'lin');
    renderList('dash-fin-list', merged.fin, 'fin');

    const totalFin = Object.values(merged.fin || {}).reduce((a,b)=>a+b,0);
    const pct = Math.min((totalFin/META_GLOBAL)*100, 100);
    
    const bar = document.getElementById('global-bar');
    if(bar) bar.style.width = `${pct}%`;
    
    const txt = document.getElementById('global-text');
    if(txt) txt.innerText = `${totalFin} / ${META_GLOBAL} (${Math.round(pct)}%)`;
    
    const todayDisp = document.getElementById('total-today-display');
    const todayTotal = Object.values(currentDataCache.fin || {}).reduce((a,b)=>a+b,0);
    if(todayDisp) todayDisp.innerText = todayTotal;
}

// --- CERRAR DÍA (GUARDAR EN HISTORIAL NUBE) ---
// Hacemos disponible la función globalmente porque type="module" aisla las funciones
window.saveDay = async function() {
    updateLocalCacheFromInputs();
    const totalToday = Object.values(currentDataCache.fin || {}).reduce((a,b)=>a+b,0);
    const totalCut = Object.values(currentDataCache.cuts || {}).reduce((a,b)=>a+b,0);
    const totalLin = Object.values(currentDataCache.liners || {}).reduce((a,b)=>a+b,0);

    if((totalToday+totalCut+totalLin) === 0 && !confirm("¿Guardar día vacío?")) return;

    const entry = {
        date: document.getElementById('production-date').value,
        total: totalToday,
        cuts: currentDataCache.cuts || {},
        liners: currentDataCache.liners || {},
        fin: currentDataCache.fin || {}
    };

    try {
        // Guardar en colección 'historial'
        await addDoc(collection(db, "historial"), entry);
        
        // Limpiar inputs visuales y en nube
        const emptyState = { cuts: {}, liners: {}, fin: {} };
        await setDoc(doc(db, "produccion_diaria", "estado_actual"), emptyState);
        
        alert("¡Día cerrado y guardado en la nube!");
        // No necesitamos recargar ni renderizar manualmente, onSnapshot lo hará
    } catch (e) {
        console.error("Error cerrando día:", e);
        alert("Error al guardar en la nube. Revisa tu conexión.");
    }
};

// --- EDITAR DÍA ---
window.editDay = async function(docId) {
    const dayData = historyDataCache.find(d => d.id === docId);
    if(!dayData) return;
    
    if(!confirm(`¿Editar el día ${dayData.date}? Se cargarán los datos y se borrará del historial.`)) return;

    try {
        // 1. Cargar datos a la "mesa de trabajo" (estado actual)
        await setDoc(doc(db, "produccion_diaria", "estado_actual"), {
            cuts: dayData.cuts,
            liners: dayData.liners,
            fin: dayData.fin
        });

        // 2. Poner la fecha en el input
        document.getElementById('production-date').value = dayData.date;

        // 3. Borrar del historial para evitar duplicados
        await deleteDoc(doc(db, "historial", docId));

        alert("Datos cargados. Realiza los cambios y vuelve a 'Cerrar Día'.");
        window.scrollTo(0,0);
    } catch(e) {
        console.error("Error editando:", e);
        alert("Error al cargar datos.");
    }
};

// --- REINICIAR TODO ---
window.resetAll = async function() {
    const password = prompt("Escribe 'BORRAR' para eliminar todo el historial de la nube:");
    if (password === 'BORRAR') {
        // Borrar estado actual
        await setDoc(doc(db, "produccion_diaria", "estado_actual"), { cuts: {}, liners: {}, fin: {} });
        
        // Borrar historial (uno por uno porque Firestore no tiene 'borrar colección')
        historyDataCache.forEach(async (item) => {
            await deleteDoc(doc(db, "historial", item.id));
        });
        alert("Base de datos reiniciada.");
    }
};

// --- GENERAR REPORTE ---
window.generateSmartReport = function() {
    const merged = mergeData(historyDataCache, currentDataCache);
    const date = new Date().toLocaleDateString();
    let csv = `REPORTE KMASCOTAS CLOUD - ${date}\n\nSECCION,DETALLE,CANTIDAD\n`;
    const addSection = (title, dataObj) => {
        csv += `\n=== ${title} ===\n`;
        if(dataObj) for(const [key, val] of Object.entries(dataObj)) {
            if(val > 0) csv += `${title},${formatLabel(key)},${val}\n`;
        }
    };
    addSection('CORTE', merged.cuts);
    addSection('FORROS', merged.liners);
    addSection('CONFECCION', merged.fin);

    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = `Reporte_Cloud_${Date.now()}.csv`;
    link.click();
};

window.toggleDash = function() { 
    const c = document.getElementById('dash-content'); 
    c.style.display = c.style.display==='none'?'grid':'none'; 
};

// --- UTILIDADES ---
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

function renderList(containerId, dataObj, type) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    
    const getGoal = (key, type) => {
        if (type === 'lin') {
            const parts = key.split('-');
            if(parts[0] === 'taf' && parts[1] === 'sq') return (GOALS[`cob-${parts[1]}-${parts[2]}`]||0) + (GOALS[`anti-${parts[1]}-${parts[2]}`]||0);
            if(parts[0] === 'cod' && parts[1] === 'sq') return (GOALS[`pel-${parts[1]}-${parts[2]}`]||0);
            return 0;
        } 
        let lookupKey = key;
        if(key.startsWith('pelcod') || key.startsWith('peltaf')) lookupKey = key.replace('pelcod', 'pel').replace('peltaf', 'pel');
        return GOALS[lookupKey] || 0;
    };

    if(dataObj) for (const [key, value] of Object.entries(dataObj)) {
        const goal = getGoal(key, type);
        if (value > 0 || goal > 0) { 
            let displayVal = goal > 0 ? `${value} / ${goal}` : `${value} <span style="font-size:0.7rem; color:#3b82f6;">(Extra)</span>`;
            let trackHtml = "";
            if (goal > 0) {
                let pct = Math.round((value/goal)*100);
                let color = pct >= 100 ? 'green' : 'yellow';
                trackHtml = `<div class="mini-track"><div class="mini-fill ${color}" style="width:${Math.min(pct,100)}%"></div></div>`;
            } else {
                trackHtml = `<div class="mini-track"><div class="mini-fill blue" style="width:100%"></div></div>`;
            }
            const row = document.createElement('div');
            row.className = 'stat-row';
            row.innerHTML = `<div class="stat-header"><span class="stat-name">${formatLabel(key)}</span><span class="stat-val">${displayVal}</span></div>${trackHtml}`;
            container.appendChild(row);
        }
    }
}

function renderHistoryTable() {
    const tbody = document.getElementById('history-body');
    if(!tbody) return;
    
    const generateTags = (obj) => {
        let tags = [];
        if(obj) for(const [k,v] of Object.entries(obj)) {
            if(v > 0) tags.push(`<b>${v}</b> ${formatLabel(k)}`);
        }
        return tags.join(', ');
    };

    tbody.innerHTML = historyDataCache.map((d) => {
        const cutsStr = generateTags(d.cuts);
        const linersStr = generateTags(d.liners);
        const finStr = generateTags(d.fin);

        let detailsHtml = "";
        if(cutsStr) detailsHtml += `<div class="hist-block hist-cut"><span class="hist-label">✂️ Corte:</span><span class="hist-content">${cutsStr}</span></div>`;
        if(linersStr) detailsHtml += `<div class="hist-block hist-lin"><span class="hist-label">🧵 Forros:</span><span class="hist-content">${linersStr}</span></div>`;
        if(finStr) detailsHtml += `<div class="hist-block hist-fin"><span class="hist-label">👕 Conf:</span><span class="hist-content">${finStr}</span></div>`;
        
        if(!detailsHtml) detailsHtml = "<em style='color:#cbd5e1'>Sin registro</em>";

        return `
        <tr>
            <td style="font-weight:bold; color:#1e293b">${d.date}</td>
            <td style="text-align:center; font-size:1.1rem; color:var(--primary)">${d.total}</td>
            <td>${detailsHtml}</td>
            <td><button class="btn-edit" onclick="editDay('${d.id}')"><i class="fas fa-pen"></i> Editar</button></td>
        </tr>`;
    }).join('');
}

function mergeData(history, current) {
    const merged = { cuts: {}, liners: {}, fin: {} };
    const add = (src) => {
        ['cuts', 'liners', 'fin'].forEach(cat => {
            if(src && src[cat]) for(const [k,v] of Object.entries(src[cat])) merged[cat][k] = (merged[cat][k]||0)+v;
        });
    };
    history.forEach(add);
    add(current);
    return merged;
}