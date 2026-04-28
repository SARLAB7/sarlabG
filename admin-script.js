import { db, auth } from './firebase-config.js';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

// --- ESTADO GLOBAL ---
let categoriasAbiertas = new Set();
let menuGlobal = {}, pedidosGlobales = [], idParaEliminar = null;

// PON AQUÍ TU CORREO DE GMAIL
const CORREO_MASTER = "cb01grupo@gmail.com";
const correosAutorizados = [CORREO_MASTER, "kelly.araujotafur@gmail.com"]; 

// --- ICONOS ---
const ICON_PREPARE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`;
const ICON_X = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_EDIT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_TRASH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

// --- AUTENTICACIÓN ---
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

if (loginBtn) loginBtn.onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
if (logoutBtn) logoutBtn.onclick = () => signOut(auth);

onAuthStateChanged(auth, (u) => {
    if(u && correosAutorizados.includes(u.email)) {
        document.getElementById('admin-panel').style.display = 'flex';
        document.getElementById('login-screen').style.display = 'none';
        if(u.email === CORREO_MASTER) document.getElementById('master-tools').style.display = 'block';
        escucharCarta(); escucharPedidos(); 
    } else {
        if(u) signOut(auth);
        document.getElementById('admin-panel').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
    }
});

// --- GESTIÓN DE CARTA ---
function escucharCarta() {
    onSnapshot(collection(db, "platos"), (snap) => {
        const list = document.getElementById('inv-list'); 
        if (!list) return;

       // Dentro de escucharCarta() en admin-script.js
const cats = { 
    diario: { titulo: "Menú del Día", platos: [] }, 
    almuerzo: { titulo: "Almuerzos", platos: [] }, 
    desayuno: { titulo: "Desayunos", platos: [] }, 
    especial: { titulo: "Especiales", platos: [] }, 
    asado: { titulo: "Asados", platos: [] }, 
    rapida: { titulo: "Comida Rápida", platos: [] }, 
    bebida: { titulo: "Bebidas", platos: [] }, 
    otros: { titulo: "Otros", platos: [] } 
};

        snap.forEach(d => {
            const it = d.data(); it.id = d.id; 
            menuGlobal[it.nombre] = it.ingredientes || [];
            if (cats[it.categoria]) cats[it.categoria].platos.push(it); 
            else cats['otros'].platos.push(it);
        });

        let h = '';
        for (const k in cats) {
            if (cats[k].platos.length === 0) continue;
            const catId = `cat-${k}`; const chevId = `chev-${k}`;

            let ph = cats[k].platos.map(it => `
                <div class="plato-row">
                    <div style="flex:1;">
                        <strong style="display:block; color:var(--white);">${it.nombre}</strong> 
                        <span style="color:var(--success); font-weight:600; font-size:0.9rem;">$${Number(it.precio).toLocaleString()}</span>
                    </div>
                    <div style="display:flex; gap:12px; align-items:center;">
                        <button onclick="editarPlato('${it.id}', '${encodeURIComponent(it.nombre)}', '${it.precio}', '${it.categoria}', '${encodeURIComponent(it.descripcion || '')}', '${(it.ingredientes || []).join(', ')}')" style="color:var(--accent-yellow); border:none; background:none; cursor:pointer;">${ICON_EDIT}</button>
                        <button onclick="eliminarPlatoModal('${it.id}')" style="color:var(--danger); border:none; background:none; cursor:pointer;">${ICON_TRASH}</button>
                    </div>
                </div>
            `).join('');

            h += `
                <div style="margin-bottom:12px;">
                    <div class="categoria-header" onclick="toggleCategoria('${catId}', '${chevId}')">
                        <div style="display:flex; align-items:center;">
                            <h4>${cats[k].titulo}</h4>
                            <span class="count-badge">${cats[k].platos.length}</span>
                        </div>
                        <svg id="${chevId}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.3s; color: var(--text-muted);">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <div id="${catId}" class="lista-categoria-oculta lista-categoria">${ph}</div>
                </div>
            `;
        }
        list.innerHTML = h;

        categoriasAbiertas.forEach(id => {
            const el = document.getElementById(id);
            const chev = document.getElementById(id.replace('cat-', 'chev-'));
            if (el) { el.classList.remove('lista-categoria-oculta'); if (chev) chev.style.transform = 'rotate(180deg)'; }
        });
    });
}

// --- GESTIÓN DE PEDIDOS ---
function escucharPedidos() {
    onSnapshot(query(collection(db, "pedidos"), orderBy("timestamp", "desc")), (snap) => {
        pedidosGlobales = [];
        const lp = document.getElementById('l-pendientes'), 
              la = document.getElementById('l-atendidos');
        
        if(!lp || !la) return;
        
        // LIMPIEZA TOTAL ANTES DE RENDERIZAR
        lp.innerHTML = ''; 
        la.innerHTML = '';
        
        snap.docs.forEach(docSnap => {
            const p = docSnap.data(); p.id = docSnap.id;
            pedidosGlobales.push(p);
            if (p.estado === 'rechazado') return;

            const card = document.createElement('div');
            card.className = `pedido-card ${p.estado}`;
            // ... resto de tu lógica de botones ...

            // IMPORTANTE: El card se añade al grid de lp directamente
            if (p.estado === 'listo') {
                la.appendChild(card);
            } else {
                lp.appendChild(card);
            }
        });
        actualizarMétricas();
    });
}

// --- MÉTRICAS (ESTILO BENTO) ---
window.actualizarMétricas = function() {
    let tVentas = 0, tMes = 0, pedidosContados = 0, rechazadosContados = 0, valorRechazados = 0;
    let tNequi = 0, tBanco = 0, tEfectivo = 0;
    const ventasPlatos = {}, usoIngredientes = {}; 
    const ahora = new Date();
    const filtro = document.getElementById('periodo-selector')?.value || 'hoy';

    pedidosGlobales.forEach(p => {
        if(!p.timestamp) return;
        const f = p.timestamp.toDate();
        let cumpleFiltro = false;
        const esMismoDia = f.getDate() === ahora.getDate() && f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();

        if (filtro === 'hoy') cumpleFiltro = esMismoDia;
        else if (filtro === 'semana') { const hace7 = new Date(); hace7.setDate(ahora.getDate() - 7); cumpleFiltro = f >= hace7; }
        else if (filtro === 'mes') { cumpleFiltro = f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear(); }
        else if (filtro === 'total') cumpleFiltro = true;

        if(cumpleFiltro) {
            if(p.estado === 'rechazado') {
                rechazadosContados++; valorRechazados += Number(p.total);
            } else {
                tVentas += Number(p.total); pedidosContados++;
                if(p.metodoPago === 'nequi') tNequi += Number(p.total);
                if(p.metodoPago === 'banco') tBanco += Number(p.total);
                if(p.metodoPago === 'efectivo') tEfectivo += Number(p.total);
                p.items.forEach(item => {
                    ventasPlatos[item.nombre] = (ventasPlatos[item.nombre] || 0) + 1;
                    const ingBase = menuGlobal[item.nombre] || [];
                    const excluidos = item.excluidos || [];
                    ingBase.forEach(ing => { if (!excluidos.includes(ing)) usoIngredientes[ing] = (usoIngredientes[ing] || 0) + 1; });
                });
            }
        }
        if(f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear() && p.estado !== 'rechazado') {
            tMes += Number(p.total);
        }
    });

    const setUI = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
    setUI('s-hoy', `$${tVentas.toLocaleString()}`);
    setUI('s-pedidos-total', pedidosContados);
    setUI('s-mes', `$${tMes.toLocaleString()}`);
    setUI('s-nequi', `$${tNequi.toLocaleString()}`);
    setUI('s-bancolombia', `$${tBanco.toLocaleString()}`);
    setUI('s-efectivo', `$${tEfectivo.toLocaleString()}`);

    const rRechazados = document.getElementById('rankings-rechazados');
    if(rRechazados) {
        rRechazados.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:2rem; font-weight:700; color:var(--danger);">$${valorRechazados.toLocaleString()}</div>
                <div style="text-align:right; color:var(--text-muted); font-size:0.9rem;">${rechazadosContados} tickets</div>
            </div>`;
    }

    const rPlatos = document.getElementById('rankings-categoria');
    if(rPlatos) {
        const sorted = Object.entries(ventasPlatos).sort((a,b) => b[1] - a[1]).slice(0,5);
        rPlatos.innerHTML = sorted.map(([n,v], i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="color:var(--text-white); font-size:0.95rem;">${i+1}. ${n}</span> 
                <strong style="color:var(--accent-yellow);">${v} u</strong>
            </div>
        `).join('') || "<span style='color:var(--text-muted); font-size:0.85rem;'>Aún no hay datos</span>";
    }
};

// --- FORMULARIO Y EDICIÓN ---
window.editarPlato = (id, n, p, c, d, i) => {
    document.getElementById('edit-id').value = id; 
    document.getElementById('name').value = decodeURIComponent(n); 
    document.getElementById('price').value = p; 
    document.getElementById('category').value = c; 
    document.getElementById('desc').value = decodeURIComponent(d); 
    document.getElementById('ingredients').value = i; 
    document.getElementById('f-title').innerText = "Editando Plato"; 
    document.getElementById('btn-cancelar').style.display = 'block';
    document.querySelector('#m-form').scrollIntoView({ behavior: 'smooth' });
};
window.cancelarEdicion = () => { 
    document.getElementById('m-form').reset(); 
    document.getElementById('edit-id').value = ''; 
    document.getElementById('f-title').innerText = "Configurar Plato"; 
    document.getElementById('btn-cancelar').style.display = 'none'; 
};
document.getElementById('m-form').onsubmit = async (e) => {
    e.preventDefault(); 
    const id = document.getElementById('edit-id').value;
    const datos = { 
        nombre: document.getElementById('name').value, 
        precio: Number(document.getElementById('price').value), 
        categoria: document.getElementById('category').value, 
        descripcion: document.getElementById('desc').value, 
        ingredientes: document.getElementById('ingredients').value.split(',').map(s => s.trim()).filter(s => s !== ''), 
        timestamp: serverTimestamp() 
    };
    if(!id) datos.disponible = true; 
    id ? await updateDoc(doc(db, "platos", id), datos) : await addDoc(collection(db, "platos"), datos); 
    window.cancelarEdicion();
};

// --- ESTADOS Y MESAS ---
window.actualizarEstado = async (id, estado) => await updateDoc(doc(db, "pedidos", id), { estado });
window.cerrarPedido = async (id, m) => await updateDoc(doc(db, "pedidos", id), { estado: 'listo', metodoPago: m });
window.revertirPedido = async (id) => await updateDoc(doc(db, "pedidos", id), { estado: 'preparando', metodoPago: null });
window.rechazarPedido = (id) => { idParaEliminar = "RECHAZAR:" + id; document.getElementById('modal-title').innerHTML = `<span style="color:var(--danger)">¿Rechazar pedido?</span>`; document.getElementById('delete-modal').style.display = 'flex'; };
window.eliminarPlatoModal = (id) => { idParaEliminar = id; document.getElementById('modal-title').innerText = '¿Borrar plato?'; document.getElementById('delete-modal').style.display = 'flex'; };
window.confirmarReinicioTotal = () => { idParaEliminar = "MASTER"; document.getElementById('modal-title').innerText = '¿REINICIAR TODO?'; document.getElementById('delete-modal').style.display = 'flex'; };

const btnConfirmar = document.getElementById('confirm-delete-btn');
if(btnConfirmar) {
    btnConfirmar.onclick = async () => {
        if(idParaEliminar === "MASTER") {
            const ps = pedidosGlobales.map(p => deleteDoc(doc(db, "pedidos", p.id))); await Promise.all(ps);
        } else if(idParaEliminar?.startsWith("RECHAZAR:")) {
            await updateDoc(doc(db, "pedidos", idParaEliminar.split(":")[1]), { estado: 'rechazado' });
        } else if(idParaEliminar) {
            await deleteDoc(doc(db, "platos", idParaEliminar));
        }
        idParaEliminar = null; document.getElementById('delete-modal').style.display = 'none';
    };
}

window.irAPedido = (id) => {
    document.querySelector('[onclick*="v-pedidos"]').click();
    setTimeout(() => {
        const el = document.getElementById(`card-${id}`);
        if(el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.border = "2px solid var(--accent-yellow)"; setTimeout(() => el.style.border = "1px solid var(--border)", 2000); }
    }, 200);
};

window.renderizarPlanoMesas = (ps) => {
    const g = document.getElementById('grid-mesas'); if(!g) return;
    const mas = ps.filter(p => p.estado !== 'listo' && p.estado !== 'rechazado' && p.cliente.toLowerCase().includes('mesa'));
    let h = '';
    for(let i=1; i<=12; i++) {
        const n = `Mesa ${i}`, p = mas.find(x => x.cliente.toLowerCase() === n.toLowerCase());
        h += p ? `<div class="mesa-card mesa-ocupada" onclick="irAPedido('${p.id}')"><h3 style="color:var(--white);">${n}</h3><span style="font-size:0.75rem; background:var(--accent-yellow); color:#000; padding:2px 6px; border-radius:4px; font-weight:700; margin: 8px 0;">OCUPADA</span><div style="color:var(--text-white);">$${Number(p.total).toLocaleString()}</div></div>` : `<div class="mesa-card mesa-libre"><h3 style="color:var(--white);">${n}</h3><span style="color:var(--success); font-size:0.85rem; margin-top:8px;">Disponible</span></div>`;
    }
    g.innerHTML = h;
};

// --- IMPRESIÓN ---
window.imprimirComanda = (ps) => {
    const p = JSON.parse(decodeURIComponent(ps));
    const div = document.createElement('div');
    div.innerHTML = `<div id="ticket-impresion"><h2 style="text-align:center;">IKU</h2><hr><p><strong>Cliente:</strong> ${p.cliente}</p><p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p><hr><ul style="list-style:none; padding:0;">${p.items.map(i => `<li><strong style="font-size:1.1rem;">1x ${i.nombre}</strong> ${i.excluidos?.length > 0 ? `<br><small style="color:red; font-weight:bold;">- Sin: ${i.excluidos.join(', ')}</small>` : ''}</li>`).join('')}</ul><hr><h3 style="text-align:right;">Total: $${Number(p.total).toLocaleString()}</h3></div>`;
    document.body.appendChild(div); window.print(); document.body.removeChild(div);
};
