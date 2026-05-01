import { db, auth } from './firebase-config.js';
import { 
    collection, onSnapshot, query, orderBy, doc, 
    deleteDoc, updateDoc, serverTimestamp, addDoc, increment 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { 
    GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

// --- ESTADO GLOBAL ---
let categoriasAbiertas = new Set();
let menuGlobal = {}, pedidosGlobales = [], idParaEliminar = null;

const CORREO_MASTER = "cb01grupo@gmail.com";
const correosAutorizados = [CORREO_MASTER, "kelly.araujotafur@gmail.com"];

// --- ICONOS ---
const ICON_PREPARE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`;
const ICON_X = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_EDIT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_TRASH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

// --- 1. AUTENTICACIÓN ---
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

if (loginBtn) loginBtn.onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
if (logoutBtn) logoutBtn.onclick = () => signOut(auth);

onAuthStateChanged(auth, (u) => {
    if(u && correosAutorizados.includes(u.email)) {
        document.getElementById('admin-panel').style.display = 'flex';
        document.getElementById('login-screen').style.display = 'none';
        if(u.email === CORREO_MASTER) document.getElementById('master-tools').style.display = 'block';
        escucharCarta(); escucharPedidos(); escucharInventario();
    } else {
        if(u) signOut(auth);
        document.getElementById('admin-panel').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
    }
});

// --- 2. GESTIÓN DE INVENTARIO (BODEGA) ---
function escucharInventario() {
    onSnapshot(collection(db, "inventario"), (snap) => {
        const lista = document.getElementById('lista-insumos');
        const alertasCocina = document.getElementById('notificaciones-cocina');
        if (!lista) return;

        let htmlLista = '';
        let htmlAlertas = '';

        snap.forEach(docSnap => {
            const i = docSnap.data();
            i.id = docSnap.id;
            const esCritico = Number(i.stockActual) <= Number(i.umbralMinimo);
            const colorCard = esCritico ? 'var(--danger)' : 'var(--border)';
            const bgCard = esCritico ? 'rgba(239, 68, 68, 0.1)' : 'var(--card-dark)';

            htmlLista += `
                <div class="stat-card" style="border: 1px solid ${colorCard}; background: ${bgCard}; position: relative;">
                    <button onclick="event.stopPropagation(); eliminarInsumoModal('${i.id}')" 
                            style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--text-muted); cursor: pointer; z-index: 5;">
                        ${ICON_TRASH}
                    </button>
                    <div onclick="editarInsumo('${i.id}', '${encodeURIComponent(i.nombre)}', ${i.stockActual}, '${i.unidad}', ${i.umbralMinimo}, ${i.costoUnitario})" style="cursor:pointer;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">${i.unidad}</span>
                            ${esCritico ? '<span style="color:var(--danger); font-size:1.2rem; margin-right: 25px;">⚠️</span>' : ''}
                        </div>
                        <strong style="font-size: 1.1rem; display: block; margin: 5px 0; color: var(--white);">${i.nombre}</strong>
                        <div style="font-size: 1.5rem; font-weight: 800; color: ${esCritico ? 'var(--danger)' : 'var(--accent-yellow)'};">
                            ${i.stockActual} 
                        </div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 5px;">
                            Costo: $${Number(i.costoUnitario).toLocaleString()} | Min: ${i.umbralMinimo}
                        </div>
                    </div>
                </div>
            `;

            if (esCritico) {
                htmlAlertas += `
                    <div style="background: var(--danger); color: white; padding: 12px 20px; border-radius: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; animation: pulse 2s infinite;">
                        <span><strong>¡AGOTÁNDOSE!</strong> Se requiere ${i.nombre.toUpperCase()} (Quedan: ${i.stockActual})</span>
                        <button onclick="cambiarVista('v-inventario', document.querySelector('[onclick*=\\'v-inventario\\']'))" style="background: white; color: var(--danger); border: none; padding: 4px 10px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 0.7rem;">ABASTECER</button>
                    </div>
                `;
            }
        });
        lista.innerHTML = htmlLista || '<p style="color:var(--text-muted);">Bodega vacía.</p>';
        if (alertasCocina) alertasCocina.innerHTML = htmlAlertas;
    });
}

window.editarInsumo = (id, n, s, u, m, c) => {
    document.getElementById('inv-id').value = id;
    document.getElementById('inv-name').value = decodeURIComponent(n);
    document.getElementById('inv-stock').value = s;
    document.getElementById('inv-unit').value = u;
    document.getElementById('inv-min').value = m;
    document.getElementById('inv-cost').value = c;
    document.getElementById('f-inv-title').innerText = "Actualizando Insumo";
    document.getElementById('btn-cancelar-inv').style.display = 'block';
    document.querySelector('#v-inventario .form-container').scrollIntoView({ behavior: 'smooth' });
};

window.cancelarEdicionInv = () => {
    document.getElementById('inv-form').reset();
    document.getElementById('inv-id').value = '';
    document.getElementById('f-inv-title').innerText = "Configurar Insumo";
    document.getElementById('btn-cancelar-inv').style.display = 'none';
};

const formInv = document.getElementById('inv-form');
if(formInv) {
    formInv.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('inv-id').value;
        const datos = {
            nombre: document.getElementById('inv-name').value,
            stockActual: Number(document.getElementById('inv-stock').value),
            unidad: document.getElementById('inv-unit').value,
            umbralMinimo: Number(document.getElementById('inv-min').value),
            costoUnitario: Number(document.getElementById('inv-cost').value),
            lastUpdate: serverTimestamp()
        };
        try {
            id ? await updateDoc(doc(db, "inventario", id), datos) : await addDoc(collection(db, "inventario"), datos);
            window.cancelarEdicionInv();
        } catch (error) { console.error("Error en bodega:", error); }
    };
}

window.eliminarInsumoModal = (id) => {
    idParaEliminar = "INSUMO:" + id; 
    document.getElementById('modal-title').innerText = '¿Eliminar este insumo de bodega?'; 
    document.getElementById('delete-modal').style.display = 'flex'; 
};

// --- 3. GESTIÓN DE CARTA ---
function escucharCarta() {
    onSnapshot(collection(db, "platos"), (snap) => {
        const list = document.getElementById('inv-list'); if (!list) return;
        const cats = { diario: { titulo: "Menú del Día", platos: [] }, desayuno: { titulo: "Desayunos", platos: [] }, especial: { titulo: "Especiales", platos: [] }, asado: { titulo: "Asados", platos: [] }, rapida: { titulo: "Comida Rápida", platos: [] }, bebida: { titulo: "Bebidas", platos: [] }, otros: { titulo: "Otros", platos: [] } };
        snap.forEach(d => {
            const it = d.data(); it.id = d.id; 
            menuGlobal[it.nombre] = it.ingredientes || [];
            if (cats[it.categoria]) cats[it.categoria].platos.push(it); else cats['otros'].platos.push(it);
        });
        let h = '';
        for (const k in cats) {
            if (cats[k].platos.length === 0) continue;
            const catId = `cat-${k}`, chevId = `chev-${k}`;
            let ph = cats[k].platos.map(it => `
                <div class="plato-row" style="background: var(--sidebar); border: 1px solid var(--border); padding: 15px; border-radius: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div><strong style="color:var(--white);">${it.nombre}</strong><br><span style="color:var(--success); font-size:0.9rem;">$${Number(it.precio).toLocaleString()}</span></div>
                    <div style="display:flex; gap:12px;">
                        <button onclick="editarPlato('${it.id}', '${encodeURIComponent(it.nombre)}', '${it.precio}', '${it.categoria}', '${encodeURIComponent(it.descripcion || '')}', '${(it.ingredientes || []).join(', ')}')" style="color:#3b82f6; background:none; border:none; cursor:pointer;">${ICON_EDIT}</button>
                        <button onclick="eliminarPlatoModal('${it.id}')" style="color:var(--danger); background:none; border:none; cursor:pointer;">${ICON_TRASH}</button>
                    </div>
                </div>`).join('');
            h += `<div class="categoria-wrapper" style="margin-bottom:12px;"><div class="categoria-header" onclick="toggleCategoria('${catId}', '${chevId}')"><div style="display:flex; align-items:center;"><h4>${cats[k].titulo}</h4><span class="count-badge">${cats[k].platos.length}</span></div><svg id="${chevId}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:0.3s;"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div id="${catId}" class="lista-categoria-oculta lista-categoria">${ph}</div></div>`;
        }
        list.innerHTML = h;
        categoriasAbiertas.forEach(id => { const el = document.getElementById(id), ch = document.getElementById(id.replace('cat-', 'chev-')); if (el) { el.classList.remove('lista-categoria-oculta'); if(ch) ch.style.transform = 'rotate(180deg)'; } });
    });
}

window.editarPlato = (id, n, p, c, d, i) => {
    document.getElementById('edit-id').value = id; 
    document.getElementById('name').value = decodeURIComponent(n); 
    document.getElementById('price').value = p; 
    document.getElementById('category').value = c; 
    document.getElementById('desc').value = decodeURIComponent(d); 
    document.getElementById('ingredients').value = i; 
    document.getElementById('f-title').innerText = "Editando Plato"; 
    document.getElementById('btn-cancelar').style.display = 'block';
    document.querySelector('.form-container').scrollIntoView({ behavior: 'smooth' });
};

window.cancelarEdicion = () => { document.getElementById('m-form').reset(); document.getElementById('edit-id').value = ''; document.getElementById('f-title').innerText = "Configurar Plato"; document.getElementById('btn-cancelar').style.display = 'none'; };

document.getElementById('m-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const datos = { nombre: document.getElementById('name').value, precio: Number(document.getElementById('price').value), categoria: document.getElementById('category').value, descripcion: document.getElementById('desc').value, ingredientes: document.getElementById('ingredients').value.split(',').map(s => s.trim()).filter(s => s !== ''), timestamp: serverTimestamp() };
    if(!id) datos.disponible = true;
    id ? await updateDoc(doc(db, "platos", id), datos) : await addDoc(collection(db, "platos"), datos);
    window.cancelarEdicion();
};

// --- 4. GESTIÓN DE PEDIDOS ---
function escucharPedidos() {
    onSnapshot(query(collection(db, "pedidos"), orderBy("timestamp", "desc")), (snap) => {
        pedidosGlobales = [];
        const lp = document.getElementById('l-pendientes'), la = document.getElementById('l-atendidos');
        if(!lp || !la) return; lp.innerHTML = ''; la.innerHTML = '';
        snap.docs.forEach(docSnap => {
            const p = docSnap.data(); p.id = docSnap.id; pedidosGlobales.push(p);
            if (p.estado === 'rechazado') return;
            const card = document.createElement('div'); card.className = `pedido-card ${p.estado}`; card.id = `card-${p.id}`;
            let btnA = p.estado === 'pendiente' ? `<div style="display:flex; gap:8px;"><button onclick="actualizarEstado('${p.id}', 'preparando')" class="btn-estado btn-preparar" style="flex:3;">${ICON_PREPARE} PREPARAR</button><button onclick="rechazarPedido('${p.id}')" class="btn-action" style="flex:1;">${ICON_X}</button></div>` : 
                       p.estado === 'preparando' ? `<div class="grid-pagos"><button onclick="cerrarPedido('${p.id}', 'nequi')" class="btn-pago nequi">NEQUI</button><button onclick="cerrarPedido('${p.id}', 'banco')" class="btn-pago banco">BANCO</button><button onclick="cerrarPedido('${p.id}', 'efectivo')" class="btn-pago efectivo">EFECTIVO</button></div>` : 
                       `<button onclick="revertirPedido('${p.id}')" class="btn-action btn-outline" style="width:100%;">${ICON_PREPARE} REVERTIR</button>`;
            card.innerHTML = `<div style="display:flex; justify-content:space-between;"><strong>${p.cliente}</strong><button onclick="imprimirComanda('${encodeURIComponent(JSON.stringify(p))}')">🖨️</button></div><div style="font-size:0.8rem; color:var(--text-muted);">${p.tipo} - $${Number(p.total).toLocaleString()}</div><div style="margin:10px 0;">${p.items.map(i => `<div>• ${i.nombre}</div>`).join('')}</div>${btnA}`;
            p.estado === 'listo' ? la.appendChild(card) : lp.appendChild(card);
        });
        actualizarMétricas(); renderizarPlanoMesas(pedidosGlobales);
    });
}

// --- 5. UI Y MODALES ---
const btnConfirmar = document.getElementById('confirm-delete-btn');
if(btnConfirmar) {
    btnConfirmar.onclick = async () => {
        if(idParaEliminar === "MASTER") {
            const ps = pedidosGlobales.map(p => deleteDoc(doc(db, "pedidos", p.id))); await Promise.all(ps);
        } else if(idParaEliminar?.startsWith("RECHAZAR:")) {
            await updateDoc(doc(db, "pedidos", idParaEliminar.split(":")[1]), { estado: 'rechazado' });
        } else if(idParaEliminar?.startsWith("INSUMO:")) {
            await deleteDoc(doc(db, "inventario", idParaEliminar.split(":")[1]));
        } else if(idParaEliminar) {
            await deleteDoc(doc(db, "platos", idParaEliminar));
        }
        idParaEliminar = null; document.getElementById('delete-modal').style.display = 'none';
    };
}

window.actualizarEstado = async (id, estado) => await updateDoc(doc(db, "pedidos", id), { estado });
window.cerrarPedido = async (id, m) => await updateDoc(doc(db, "pedidos", id), { estado: 'listo', metodoPago: m });
window.revertirPedido = async (id) => await updateDoc(doc(db, "pedidos", id), { estado: 'preparando', metodoPago: null });
window.rechazarPedido = (id) => { idParaEliminar = "RECHAZAR:" + id; document.getElementById('modal-title').innerHTML = `<span style="color:var(--danger)">¿Rechazar pedido?</span>`; document.getElementById('delete-modal').style.display = 'flex'; };
window.eliminarPlatoModal = (id) => { idParaEliminar = id; document.getElementById('modal-title').innerText = '¿Borrar plato?'; document.getElementById('delete-modal').style.display = 'flex'; };
window.confirmarReinicioTotal = () => { idParaEliminar = "MASTER"; document.getElementById('modal-title').innerText = '¿REINICIAR TODO?'; document.getElementById('delete-modal').style.display = 'flex'; };

window.toggleCategoria = (listaId, chevronId) => {
    const l = document.getElementById(listaId), c = document.getElementById(chevronId);
    if(l) { l.classList.toggle('lista-categoria-oculta'); !l.classList.contains('lista-categoria-oculta') ? categoriasAbiertas.add(listaId) : categoriasAbiertas.delete(listaId); }
    if(c) c.style.transform = l.classList.contains('lista-categoria-oculta') ? 'rotate(0deg)' : 'rotate(180deg)';
};

window.renderizarPlanoMesas = (ps) => {
    const g = document.getElementById('grid-mesas'); if(!g) return;
    const mas = ps.filter(p => p.estado !== 'listo' && p.estado !== 'rechazado' && p.cliente.toLowerCase().includes('mesa'));
    let h = '';
    for(let i=1; i<=12; i++) {
        const n = `Mesa ${i}`, p = mas.find(x => x.cliente.toLowerCase() === n.toLowerCase());
        h += p ? `<div class="mesa-card mesa-ocupada" onclick="irAPedido('${p.id}')"><h3>${n}</h3><span>OCUPADA</span><div>$${Number(p.total).toLocaleString()}</div></div>` : `<div class="mesa-card mesa-libre"><h3>${n}</h3><span style="color:var(--success);">Libre</span></div>`;
    }
    g.innerHTML = h;
};

window.irAPedido = (id) => {
    document.querySelector('[onclick*="v-pedidos"]').click();
    setTimeout(() => {
        const el = document.getElementById(`card-${id}`);
        if(el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.border = "2px solid var(--accent-yellow)"; setTimeout(() => el.style.border = "none", 2000); }
    }, 200);
};

window.imprimirComanda = (ps) => {
    const p = JSON.parse(decodeURIComponent(ps));
    const div = document.createElement('div');
    div.innerHTML = `<div id="ticket-impresion"><h2 style="text-align:center;">IKU</h2><hr><p><strong>Cliente:</strong> ${p.cliente}</p><p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p><hr><ul style="list-style:none; padding:0;">${p.items.map(i => `<li>1x ${i.nombre}</li>`).join('')}</ul><hr><h3 style="text-align:right;">Total: $${Number(p.total).toLocaleString()}</h3></div>`;
    document.body.appendChild(div); window.print(); document.body.removeChild(div);
};

// --- 6. MÉTRICAS ---
window.actualizarMétricas = function() {
    let tVentas = 0, tMes = 0, pedidosContados = 0, rechazadosContados = 0, valorRechazados = 0, tNequi = 0, tBanco = 0, tEfectivo = 0;
    const ventasPlatos = {}, usoIngredientes = {}, ahora = new Date(), filtro = document.getElementById('periodo-selector')?.value || 'hoy';

    pedidosGlobales.forEach(p => {
        if(!p.timestamp) return;
        const f = p.timestamp.toDate(), esMismoDia = f.getDate() === ahora.getDate() && f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
        let cumpleFiltro = filtro === 'hoy' ? esMismoDia : filtro === 'semana' ? f >= (new Date().setDate(ahora.getDate()-7)) : filtro === 'mes' ? (f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear()) : true;

        if(cumpleFiltro) {
            if(p.estado === 'rechazado') { rechazadosContados++; valorRechazados += Number(p.total); }
            else {
                tVentas += Number(p.total); pedidosContados++;
                if(p.metodoPago === 'nequi') tNequi += Number(p.total);
                if(p.metodoPago === 'banco') tBanco += Number(p.total);
                if(p.metodoPago === 'efectivo') tEfectivo += Number(p.total);
                p.items.forEach(item => {
                    ventasPlatos[item.nombre] = (ventasPlatos[item.nombre] || 0) + 1;
                    const ingBase = menuGlobal[item.nombre] || [], excluidos = item.excluidos || [];
                    ingBase.forEach(ing => { if (!excluidos.includes(ing)) usoIngredientes[ing] = (usoIngredientes[ing] || 0) + 1; });
                });
            }
        }
        if(f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear() && p.estado !== 'rechazado') tMes += Number(p.total);
    });

    const setUI = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
    setUI('s-hoy', `$${tVentas.toLocaleString()}`); setUI('s-pedidos-total', pedidosContados); setUI('s-mes', `$${tMes.toLocaleString()}`);
    setUI('s-nequi', `$${tNequi.toLocaleString()}`); setUI('s-bancolombia', `$${tBanco.toLocaleString()}`); setUI('s-efectivo', `$${tEfectivo.toLocaleString()}`);
};