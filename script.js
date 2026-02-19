const META_GLOBAL = 380;
// AHORA INCLUIMOS XL EN LOS TAMAÑOS
const SIZES = ['sq-p', 'sq-m', 'sq-pit', 'sq-xl', 'rd-p', 'rd-m', 'rd-pit', 'rd-xl'];

const GOALS = {
    'cob-sq-p': 50, 'cob-sq-m': 50, 'cob-sq-pit': 50,
    'anti-sq-p': 50, 'anti-sq-m': 50, 'anti-sq-pit': 50,
    'pel-sq-p': 20, 'pel-sq-m': 30, 'pel-sq-pit': 30
};

window.onload = () => {
    document.getElementById('production-date').valueAsDate = new Date();
    loadCurrent();
    updateDashboard();
    renderHistoryTable();
};

const val = (id) => parseInt(document.getElementById(id)?.value) || 0;

document.addEventListener('input', (e) => {
    if(e.target.tagName === 'INPUT') {
        saveCurrent();
        updateDashboard();
    }
});

// --- GENERADOR DE NOMBRES EN ESPAÑOL ---
const formatLabel = (key) => {
    const parts = key.split('-');
    let mat = parts[0].toUpperCase();
    
    // Traducciones
    if(mat === 'PELCOD') mat = 'PEL-COD';
    if(mat === 'PELTAF') mat = 'PEL-TAF';
    if(parts[0] === 'taf' && parts[1] === 'cap') return `MOLDE ENCAP ${parts[2].toUpperCase()}`;

    // Forma
    let shape = parts[1] === 'sq' ? 'CUA' : (parts[1] === 'rd' ? 'RED' : 'ENCAP');
    
    // Talla
    let size = parts[2].toUpperCase();
    
    return `${mat} ${shape} ${size}`;
};

function updateDashboard() {
    const history = JSON.parse(localStorage.getItem('kmascotasV15_history')) || [];
    const current = getCurrentData();
    const merged = mergeData(history, current);

    renderList('dash-cuts-list', merged.cuts, 'cut');
    renderList('dash-liners-list', merged.liners, 'lin');
    renderList('dash-fin-list', merged.fin, 'fin');

    const totalFin = Object.values(merged.fin).reduce((a,b)=>a+b,0);
    const pct = Math.min((totalFin/META_GLOBAL)*100, 100);
    
    document.getElementById('global-bar').style.width = `${pct}%`;
    document.getElementById('global-text').innerText = `${totalFin} / ${META_GLOBAL} (${Math.round(pct)}%)`;
    document.getElementById('total-today-display').innerText = Object.values(current.fin).reduce((a,b)=>a+b,0);
}

function renderList(containerId, dataObj, type) {
    const container = document.getElementById(containerId);
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

    for (const [key, value] of Object.entries(dataObj)) {
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

function editDay(index) {
    const history = JSON.parse(localStorage.getItem('kmascotasV15_history')) || [];
    const dayData = history[index];
    if(!dayData) return;
    if(!confirm(`¿Editar el día ${dayData.date}?`)) return;

    // Cargar datos a inputs (si existen)
    const loadToInput = (prefix, obj) => {
        for(const [key, val] of Object.entries(obj)) {
            const el = document.getElementById(`${prefix}-${key}`);
            if(el) el.value = val;
        }
    };

    loadToInput('cut', dayData.cuts);
    loadToInput('lin', dayData.liners);
    loadToInput('fin', dayData.fin);

    document.getElementById('production-date').value = dayData.date;

    history.splice(index, 1);
    localStorage.setItem('kmascotasV15_history', JSON.stringify(history));

    saveCurrent();
    updateDashboard();
    renderHistoryTable();
    alert("Datos cargados. Realiza los cambios y dale a 'Cerrar Día'.");
    window.scrollTo(0,0);
}

function generateSmartReport() {
    const history = JSON.parse(localStorage.getItem('kmascotasV15_history')) || [];
    const merged = mergeData(history, getCurrentData());
    const date = new Date().toLocaleDateString();

    let csv = `REPORTE KMASCOTAS - ${date}\n\nSECCION,DETALLE,CANTIDAD\n`;
    const addSection = (title, dataObj) => {
        csv += `\n=== ${title} ===\n`;
        for(const [key, val] of Object.entries(dataObj)) {
            if(val > 0) csv += `${title},${formatLabel(key)},${val}\n`;
        }
    };
    addSection('CORTE', merged.cuts);
    addSection('FORROS', merged.liners);
    addSection('CONFECCION', merged.fin);

    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = `Reporte_${Date.now()}.csv`;
    link.click();
}

function getCurrentData() {
    const data = { cuts: {}, liners: {}, fin: {} };
    // TELAS
    ['cob', 'anti', 'pel', 'htr'].forEach(m => SIZES.forEach(s => data.cuts[`${m}-${s}`] = val(`cut-${m}-${s}`)));
    // FORROS
    ['taf', 'cod'].forEach(l => SIZES.forEach(s => data.liners[`${l}-${s}`] = val(`lin-${l}-${s}`)));
    ['p','m','pit'].forEach(s => data.liners[`taf-cap-${s}`] = val(`lin-taf-cap-${s}`));
    // CONFECCION
    ['cob', 'anti', 'pelcod', 'peltaf', 'encap', 'htr'].forEach(cat => SIZES.forEach(s => data.fin[`${cat}-${s}`] = val(`fin-${cat}-${s}`)));
    return data;
}

function mergeData(history, current) {
    const merged = { cuts: {}, liners: {}, fin: {} };
    const add = (src) => {
        ['cuts', 'liners', 'fin'].forEach(cat => {
            if(src[cat]) for(const [k,v] of Object.entries(src[cat])) merged[cat][k] = (merged[cat][k]||0)+v;
        });
    };
    history.forEach(add);
    add(current);
    return merged;
}

function saveCurrent() {
    const inputs = document.querySelectorAll('input');
    const cache = {};
    inputs.forEach(i => cache[i.id] = i.value);
    localStorage.setItem('kmascotasV15_cache', JSON.stringify(cache));
}

function loadCurrent() {
    const cache = JSON.parse(localStorage.getItem('kmascotasV15_cache'));
    if(cache) for(const [k, v] of Object.entries(cache)) { const el = document.getElementById(k); if(el) el.value = v; }
}

function saveDay() {
    const current = getCurrentData();
    const totalFin = Object.values(current.fin).reduce((a,b)=>a+b,0);
    const totalCut = Object.values(current.cuts).reduce((a,b)=>a+b,0);
    const totalLin = Object.values(current.liners).reduce((a,b)=>a+b,0);
    
    if((totalFin+totalCut+totalLin) === 0 && !confirm("¿Guardar día vacío?")) return;
    
    const entry = { 
        date: document.getElementById('production-date').value, 
        total: totalFin, 
        cuts: current.cuts, 
        liners: current.liners, 
        fin: current.fin 
    };

    const history = JSON.parse(localStorage.getItem('kmascotasV15_history')) || [];
    history.push(entry);
    
    // ORDENAMIENTO POR FECHA
    history.sort((a, b) => new Date(a.date) - new Date(b.date));

    localStorage.setItem('kmascotasV15_history', JSON.stringify(history));
    
    document.querySelectorAll('input[type="number"]').forEach(i => i.value = "");
    localStorage.removeItem('kmascotasV15_cache');
    updateDashboard();
    renderHistoryTable();
}

function renderHistoryTable() {
    const history = JSON.parse(localStorage.getItem('kmascotasV15_history')) || [];
    const tbody = document.getElementById('history-body');
    
    const generateTags = (obj) => {
        let tags = [];
        for(const [k,v] of Object.entries(obj)) {
            if(v > 0) tags.push(`<b>${v}</b> ${formatLabel(k)}`);
        }
        return tags.join(', ');
    };

    tbody.innerHTML = history.map((d, index) => {
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
            <td><button class="btn-edit" onclick="editDay(${index})"><i class="fas fa-pen"></i> Editar</button></td>
        </tr>`;
    }).join('');
}

function resetAll() { if(confirm("¿Borrar todo?")) { localStorage.clear(); location.reload(); } }
function toggleDash() { const c = document.getElementById('dash-content'); c.style.display = c.style.display==='none'?'grid':'none'; }
renderHistoryTable();