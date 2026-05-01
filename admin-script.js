import { db, auth } from './firebase-config.js';
import { 
    collection, onSnapshot, query, orderBy, doc, 
    deleteDoc, updateDoc, serverTimestamp, addDoc, increment, getDocs, where, limit 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { 
    GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

// --- ESTADO GLOBAL ---
let categoriasAbiertas = new Set();
let menuGlobal = {}, pedidosGlobales = [], insumosGlobales = [], idParaEliminar = null;

const CORREO_MASTER = "cb01grupo@gmail.com";
const correosAutorizados = [CORREO_MASTER, "kelly.araujotafur@gmail.com"];

const ICON_PREPARE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`;
const ICON_X = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_EDIT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_TRASH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

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

// --- 2. PEDIDOS, MESAS Y MÉTRICAS (RESTAURADO) ---
function escucharPedidos() {
    onSnapshot(query(collection(db, "pedidos"), orderBy("timestamp", "desc")), (snap) => {
        pedidosGlobales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPedidosUI();
        actualizarMétricas();
        renderizarPlanoMesas(pedidosGlobales);
    });
}

function renderPedidosUI() {
    const lp = document.getElementById('l-pendientes'), la = document.getElementById('l-atendidos');
    if(!lp || !la) return; lp.innerHTML = ''; la.innerHTML = '';
    pedidosGlobales.forEach(p => {
        if (p.estado === 'rechazado') return;
        const card = document.createElement('div'); card.className = `pedido-card ${p.estado}`; card.id = `card-${p.id}`;
        let btnA = p.estado === 'pendiente' ? `<div style="display:flex; gap:8px;"><button onclick="actualizarEstado('${p.id}', 'preparando')" class="btn-estado btn-preparar" style="flex:3;">${ICON_PREPARE} PREPARAR</button><button onclick="rechazarPedido('${p.id}')" class="btn-action" style="flex:1;">${ICON_X}</button></div>` : 
                   p.estado === 'preparando' ? `<div class="grid-pagos"><button onclick="cerrarPedido('${p.id}', 'nequi')" class="btn-pago nequi">NEQUI</button><button onclick="cerrarPedido('${p.id}', 'banco')" class="btn-pago banco">BANCO</button><button onclick="cerrarPedido('${p.id}', 'efectivo')" class="btn-pago efectivo">EFECTIVO</button></div>` : 
                   `<button onclick="revertirPedido('${p.id}')" class="btn-action btn-outline" style="width:100%;">${ICON_PREPARE} REVERTIR</button>`;
        
        card.innerHTML = `<div style="display:flex; justify-content:space-between;"><strong>${p.cliente}</strong><button onclick="imprimirComanda('${encodeURIComponent(JSON.stringify(p))}')" style="background:none; border:none; cursor:pointer;">🖨️</button></div><div style="font-size:0.8rem; color:var(--text-muted);">${p.tipo} - $${Number(p.total).toLocaleString()}</div><div style="margin:10px 0;">${p.items.map(i => `<div>• ${i.nombre}</div>`).join('')}</div>${btnA}`;
        p.estado === 'listo' ? la.appendChild(card) : lp.appendChild(card);
    });
}

window.actualizarMétricas = function() {
    let tVentas = 0, tMes = 0, pedidosContados = 0, tNequi = 0, tBanco = 0, tEfectivo = 0, rechazadosContados = 0;
    const ahora = new Date();
    const filtro = document.getElementById('periodo-selector')?.value || 'hoy';

    pedidosGlobales.forEach(p => {
        if(!p.timestamp) return;
        const f = p.timestamp.toDate();
        const esMismoDia = f.getDate() === ahora.getDate() && f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
        let cumpleFiltro = filtro === 'hoy' ? esMismoDia : filtro === 'semana' ? f >= (new Date().setDate(ahora.getDate()-7)) : filtro === 'mes' ? (f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear()) : true;

        if(cumpleFiltro) {
            if(p.estado === 'rechazado') { rechazadosContados++; }
            else {
                tVentas += Number(p.total); pedidosContados++;
                if(p.metodoPago === 'nequi') tNequi += Number(p.total);
                if(p.metodoPago === 'banco') tBanco += Number(p.total);
                if(p.metodoPago === 'efectivo') tEfectivo += Number(p.total);
            }
        }
        if(f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear() && p.estado !== 'rechazado') tMes += Number(p.total);
    });

    const setUI = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
    setUI('s-hoy', `$${tVentas.toLocaleString()}`); setUI('s-pedidos-total', pedidosContados); setUI('s-mes', `$${tMes.toLocaleString()}`);
    setUI('s-nequi', `$${tNequi.toLocaleString()}`); setUI('s-bancolombia', `$${tBanco.toLocaleString()}`); setUI('s-efectivo', `$${tEfectivo.toLocaleString()}`);
    
    const rDiv = document.getElementById('rankings-rechazados');
    if(rDiv) rDiv.innerHTML = `<div style="padding:10px; border-radius:8px; border:1px solid var(--border);">Total Rechazos: <strong>${rechazadosContados}</strong></div>`;
};

window.renderizarPlanoMesas = (ps) => {
    const g = document.getElementById('grid-mesas'); if(!g) return;
    const mas = ps.filter(p => p.estado !== 'listo' && p.estado !== 'rechazado' && p.cliente.toLowerCase().includes('mesa'));
    let h = '';
    for(let i=1; i<=12; i++) {
        const n = `Mesa ${i}`, p = mas.find(x => x.cliente.toLowerCase() === n.toLowerCase());
        h += p ? `<div class="mesa-card mesa-ocupada" onclick="irAPedido('${p.id}')"><h3>${n}</h3><span>OCUPADA</span><div style="font-weight:bold; color:var(--accent-yellow); margin-top:5px;">$${Number(p.total).toLocaleString()}</div></div>` : `<div class="mesa-card mesa-libre"><h3 style="color:var(--text-muted);">${n}</h3><span style="color:var(--success);">Libre</span></div>`;
    }
    g.innerHTML = h;
};

window.irAPedido = (id) => {
    document.querySelector('[onclick*="v-pedidos"]').click();
    setTimeout(() => {
        const el = document.getElementById(`card-${id}`);
        if(el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.border = "2px solid var(--accent-yellow)"; setTimeout(() => el.style.border = "1px solid var(--border)", 2000); }
    }, 200);
};

window.actualizarEstado = async (id, estado) => {
    if (estado === 'preparando') await procesarDescuentoStock(id);
    await updateDoc(doc(db, "pedidos", id), { estado });
};

window.cerrarPedido = async (id, m) => await updateDoc(doc(db, "pedidos", id), { estado: 'listo', metodoPago: m });
window.revertirPedido = async (id) => await updateDoc(doc(db, "pedidos", id), { estado: 'preparando', metodoPago: null });
window.rechazarPedido = (id) => { idParaEliminar = "RECHAZAR:" + id; document.getElementById('modal-title').innerHTML = `<span style="color:var(--danger)">¿Rechazar pedido?</span>`; document.getElementById('delete-modal').style.display = 'flex'; };

// --- 3. BODEGA, INVENTARIO Y KARDEX ---
function escucharInventario() {
    onSnapshot(collection(db, "inventario"), (snap) => {
        const lista = document.getElementById('lista-insumos');
        if (!lista) return;

        insumosGlobales = [];
        let htmlLista = '';
        snap.forEach(docSnap => {
            const i = docSnap.data(); i.id = docSnap.id; insumosGlobales.push(i);
            const esCritico = Number(i.stockActual) <= Number(i.umbralMinimo);
            const colorCard = esCritico ? 'var(--danger)' : 'var(--border)';

            htmlLista += `
                <div class="stat-card" style="border: 1px solid ${colorCard}; position: relative; padding: 20px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">
                            ${i.unidad} ${i.factor ? `(F: ${i.factor})` : ''}
                        </span>
                        <div style="display:flex; gap:8px;">
                            <button onclick="verHistorialInsumo('${i.id}', '${i.nombre}')" style="background:none; border:none; color:var(--accent-yellow); cursor:pointer;">🕒</button>
                            <button onclick="eliminarInsumoModal('${i.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer;">${ICON_TRASH}</button>
                        </div>
                    </div>
                    <div onclick="editarInsumo('${i.id}', '${encodeURIComponent(i.nombre)}', ${i.stockActual}, '${i.unidad}', ${i.umbralMinimo}, ${i.costoUnitario}, ${i.factor || 1})" style="cursor:pointer;">
                        <strong style="font-size: 1.1rem; display: block; color: var(--white);">${i.nombre}</strong>
                        <div style="font-size: 1.6rem; font-weight: 800; color: ${esCritico ? 'var(--danger)' : 'var(--white)'}; margin: 5px 0;">
                            ${Number(i.stockActual).toLocaleString()}
                        </div>
                        <div style="font-size: 0.7rem; color: var(--text-muted);">
                            Costo Prom: $${Number(i.costoUnitario || 0).toFixed(2)}
                        </div>
                    </div>
                </div>
            `;
        });
        lista.innerHTML = htmlLista || '<p style="color:var(--text-muted);">Sin insumos.</p>';
        actualizarSelectoresInsumos();
    });
}

// Eventos de Formularios Inventario (Asegurados)
const formInv = document.getElementById('inv-form');
if(formInv) {
    formInv.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('inv-id').value;
        const datos = {
            nombre: document.getElementById('inv-name').value,
            stockActual: Number(document.getElementById('inv-stock').value || 0),
            unidad: document.getElementById('inv-unit').value,
            umbralMinimo: Number(document.getElementById('inv-min').value),
            costoUnitario: Number(document.getElementById('inv-cost').value),
            factor: Number(document.getElementById('inv-factor').value) || 1,
            lastUpdate: serverTimestamp()
        };
        try {
            id ? await updateDoc(doc(db, "inventario", id), datos) : await addDoc(collection(db, "inventario"), datos);
            window.cancelarEdicionInv();
        } catch (error) { console.error("Error en inventario:", error); }
    };
}

const formCompra = document.getElementById('f-compra');
if(formCompra) {
    formCompra.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('compra-insumo').value;
        const cantCompra = Number(document.getElementById('compra-cant').value);
        const costoTotal = Number(document.getElementById('compra-costo').value);
        const insumo = insumosGlobales.find(i => i.id === id);
        const factor = Number(insumo.factor) || 1;
        const cantReal = cantCompra * factor;

        await updateDoc(doc(db, "inventario", id), { stockActual: increment(cantReal), costoUnitario: costoTotal / cantReal });
        await addDoc(collection(db, "kardex"), { insumoId: id, tipo: 'entrada', concepto: 'Compra Stock', cantidad: cantReal, costoReferencia: costoTotal, timestamp: serverTimestamp() });
        cerrarModales();
    };
}

const formMerma = document.getElementById('f-merma');
if(formMerma) {
    formMerma.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('merma-insumo').value;
        const cant = Number(document.getElementById('merma-cant').value);
        const motivo = document.getElementById('merma-motivo').value;

        await updateDoc(doc(db, "inventario", id), { stockActual: increment(-cant) });
        await addDoc(collection(db, "kardex"), { insumoId: id, tipo: 'salida', concepto: `Merma: ${motivo}`, cantidad: cant, timestamp: serverTimestamp() });
        cerrarModales();
    };
}

window.verHistorialInsumo = async (id, nombre) => {
    const seccion = document.getElementById('seccion-kardex');
    const tablaBody = document.getElementById('tabla-kardex-body');
    seccion.style.display = 'block'; seccion.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('kardex-titulo').innerText = `Historial: ${nombre}`;
    tablaBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Consultando...</td></tr>';

    try {
        const q = query(collection(db, "kardex"), where("insumoId", "==", id), orderBy("timestamp", "desc"), limit(20));
        const snap = await getDocs(q);
        let rows = '';
        snap.forEach(d => {
            const m = d.data();
            const fecha = m.timestamp?.toDate().toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Reciente';
            const esEntrada = m.tipo === 'entrada';
            rows += `<tr style="border-bottom: 1px solid var(--border);">
                        <td style="padding: 12px; color: var(--text-muted); font-size: 0.75rem;">${fecha}</td>
                        <td style="padding: 12px;">${m.concepto}</td>
                        <td style="padding: 12px; color: ${esEntrada ? '#22c55e' : '#ef4444'}; font-weight: 600;">${m.tipo.toUpperCase()}</td>
                        <td style="padding: 12px; text-align: right; color: ${esEntrada ? '#22c55e' : '#ef4444'}; font-weight: 700;">${esEntrada ? '+' : '-'}${m.cantidad}</td>
                    </tr>`;
        });
        tablaBody.innerHTML = rows || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No hay movimientos.</td></tr>';
    } catch (e) { tablaBody.innerHTML = '<tr><td colspan="4" style="color:var(--danger); text-align:center;">Error al cargar.</td></tr>'; }
};

async function procesarDescuentoStock(pedidoId) {
    const pedido = pedidosGlobales.find(p => p.id === pedidoId);
    if (!pedido) return;
    for (const item of pedido.items) {
        const platoData = menuGlobal[item.nombre];
        if (platoData && platoData.receta) {
            for (const [insumoId, cantidad] of Object.entries(platoData.receta)) {
                await updateDoc(doc(db, "inventario", insumoId), { stockActual: increment(-cantidad) });
                await addDoc(collection(db, "kardex"), { insumoId: insumoId, tipo: 'salida', concepto: `Venta: ${item.nombre}`, cantidad: cantidad, timestamp: serverTimestamp() });
            }
        }
    }
}

// --- 4. GESTIÓN DE CARTA ---
function escucharCarta() {
    onSnapshot(collection(db, "platos"), (snap) => {
        const list = document.getElementById('inv-list'); if (!list) return;
        const cats = { diario: { titulo: "Menú del Día", platos: [] }, desayuno: { titulo: "Desayunos", platos: [] }, especial: { titulo: "Especiales", platos: [] }, asado: { titulo: "Asados", platos: [] }, rapida: { titulo: "Comida Rápida", platos: [] }, bebida: { titulo: "Bebidas", platos: [] }, otros: { titulo: "Otros", platos: [] } };
        snap.forEach(d => {
            const it = d.data(); it.id = d.id; menuGlobal[it.nombre] = it;
            if (cats[it.categoria]) cats[it.categoria].platos.push(it); else cats['otros'].platos.push(it);
        });
        let h = '';
        for (const k in cats) {
            if (cats[k].platos.length === 0) continue;
            const catId = `cat-${k}`, chevId = `chev-${k}`;
            let ph = cats[k].platos.map(it => `
                <div class="plato-row" style="background: var(--sidebar); border: 1px solid var(--border); padding: 12px; border-radius: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div><strong style="color:var(--white);">${it.nombre}</strong><br><span style="color:var(--success); font-size:0.8rem;">$${Number(it.precio).toLocaleString()}</span></div>
                    <div style="display:flex; gap:12px;">
                        <button onclick="editarPlato('${it.id}', '${encodeURIComponent(it.nombre)}', '${it.precio}', '${it.categoria}', '${encodeURIComponent(it.descripcion || '')}', '${(it.ingredientes || []).join(', ')}', '${encodeURIComponent(JSON.stringify(it.receta || {}))}')" style="color:#3b82f6; background:none; border:none; cursor:pointer;">${ICON_EDIT}</button>
                        <button onclick="eliminarPlatoModal('${it.id}')" style="color:var(--danger); background:none; border:none; cursor:pointer;">${ICON_TRASH}</button>
                    </div>
                </div>`).join('');
            h += `<div class="categoria-wrapper"><div class="categoria-header" onclick="toggleCategoria('${catId}', '${chevId}')"><h4>${cats[k].titulo}</h4><svg id="${chevId}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></div><div id="${catId}" class="lista-categoria-oculta lista-categoria">${ph}</div></div>`;
        }
        list.innerHTML = h;
    });
}

document.getElementById('m-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const receta = {};
    document.querySelectorAll('.fila-receta').forEach(fila => {
        const insId = fila.querySelector('.receta-insumo').value;
        const cant = Number(fila.querySelector('.receta-cantidad').value);
        if (insId && cant > 0) receta[insId] = cant;
    });
    const datos = { 
        nombre: document.getElementById('name').value, 
        precio: Number(document.getElementById('price').value), 
        categoria: document.getElementById('category').value, 
        descripcion: document.getElementById('desc').value, 
        ingredientes: document.getElementById('ingredients').value.split(',').map(s => s.trim()).filter(s => s !== ''), 
        receta: receta,
        timestamp: serverTimestamp() 
    };
    if(!id) datos.disponible = true;
    id ? await updateDoc(doc(db, "platos", id), datos) : await addDoc(collection(db, "platos"), datos);
    window.cancelarEdicion();
};

window.agregarFilaReceta = (insId = '', cant = '') => {
    const contenedor = document.getElementById('receta-items');
    const div = document.createElement('div');
    div.className = 'fila-receta';
    div.style = "display: flex; gap: 8px; margin-bottom: 8px; align-items: center;";
    let opciones = insumosGlobales.map(i => `<option value="${i.id}" ${i.id === insId ? 'selected' : ''}>${i.nombre} (${i.unidad})</option>`).join('');
    div.innerHTML = `<select class="receta-insumo" style="flex: 2;">${opciones}</select><input type="number" class="receta-cantidad" value="${cant}" style="flex: 1;" step="any"><button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; color:var(--danger); cursor:pointer;">${ICON_X}</button>`;
    contenedor.appendChild(div);
};

// --- 5. UTILIDADES Y GLOBALES ---
window.editarInsumo = (id, n, s, u, m, c, f) => {
    document.getElementById('inv-id').value = id;
    document.getElementById('inv-name').value = decodeURIComponent(n);
    document.getElementById('inv-stock').value = s || 0;
    document.getElementById('inv-unit').value = u;
    document.getElementById('inv-min').value = m;
    document.getElementById('inv-cost').value = c;
    document.getElementById('inv-factor').value = f || 1;
    document.getElementById('f-inv-title').innerText = "Actualizando Insumo";
    document.getElementById('btn-cancelar-inv').style.display = 'block';
};
window.cancelarEdicionInv = () => { document.getElementById('inv-form').reset(); document.getElementById('inv-id').value = ''; document.getElementById('f-inv-title').innerText = "Configurar Insumo"; document.getElementById('btn-cancelar-inv').style.display = 'none'; };
window.eliminarInsumoModal = (id) => { idParaEliminar = "INSUMO:" + id; document.getElementById('modal-title').innerText = '¿Eliminar este insumo?'; document.getElementById('delete-modal').style.display = 'flex'; };
window.editarPlato = (id, n, p, c, d, i, recetaJson) => { document.getElementById('edit-id').value = id; document.getElementById('name').value = decodeURIComponent(n); document.getElementById('price').value = p; document.getElementById('category').value = c; document.getElementById('desc').value = decodeURIComponent(d); document.getElementById('ingredients').value = i; document.getElementById('f-title').innerText = "Editando Plato"; document.getElementById('btn-cancelar').style.display = 'block'; const recetaItems = document.getElementById('receta-items'); recetaItems.innerHTML = ''; const receta = JSON.parse(decodeURIComponent(recetaJson || '{}')); Object.entries(receta).forEach(([insId, cant]) => agregarFilaReceta(insId, cant)); };
window.cancelarEdicion = () => { document.getElementById('m-form').reset(); document.getElementById('edit-id').value = ''; document.getElementById('receta-items').innerHTML = ''; document.getElementById('f-title').innerText = "Configurar Plato"; document.getElementById('btn-cancelar').style.display = 'none'; };
window.eliminarPlatoModal = (id) => { idParaEliminar = id; document.getElementById('modal-title').innerText = '¿Borrar plato?'; document.getElementById('delete-modal').style.display = 'flex'; };
window.toggleCategoria = (listaId, chevronId) => { const l = document.getElementById(listaId), c = document.getElementById(chevronId); if(l) { l.classList.toggle('lista-categoria-oculta'); !l.classList.contains('lista-categoria-oculta') ? categoriasAbiertas.add(listaId) : categoriasAbiertas.delete(listaId); } if(c) c.style.transform = l.classList.contains('lista-categoria-oculta') ? 'rotate(0deg)' : 'rotate(180deg)'; };
window.actualizarSelectoresInsumos = () => { const opts = insumosGlobales.map(i => `<option value="${i.id}">${i.nombre}</option>`).join(''); document.getElementById('compra-insumo').innerHTML = opts; document.getElementById('merma-insumo').innerHTML = opts; };
window.abrirModalCompra = () => { window.actualizarSelectoresInsumos(); document.getElementById('modal-compra').style.display = 'flex'; };
window.abrirModalMerma = () => { window.actualizarSelectoresInsumos(); document.getElementById('modal-merma').style.display = 'flex'; };
window.cerrarModales = () => { document.getElementById('modal-compra').style.display = 'none'; document.getElementById('modal-merma').style.display = 'none'; document.getElementById('f-compra')?.reset(); document.getElementById('f-merma')?.reset(); };
window.imprimirComanda = (ps) => { const p = JSON.parse(decodeURIComponent(ps)); const div = document.createElement('div'); div.innerHTML = `<div id="ticket-impresion"><h2 style="text-align:center;">IKU</h2><hr><p><strong>Cliente:</strong> ${p.cliente}</p><hr><ul>${p.items.map(i => `<li>${i.nombre}</li>`).join('')}</ul><hr><h3 style="text-align:right;">Total: $${Number(p.total).toLocaleString()}</h3></div>`; document.body.appendChild(div); window.print(); document.body.removeChild(div); };
window.confirmarReinicioTotal = () => { idParaEliminar = "MASTER"; document.getElementById('modal-title').innerText = '¿REINICIAR TODO?'; document.getElementById('delete-modal').style.display = 'flex'; };

// --- FUNCIÓN GLOBAL DE CONFIRMACIÓN (MODAL) ---
window.confirmarAccionModal = async () => {
    const btn = document.getElementById('confirm-delete-btn');
    const textoOriginal = btn.innerText;
    
    try {
        btn.innerText = "Procesando..."; // Feedback visual
        btn.disabled = true;

        if (idParaEliminar === "MASTER") {
            // Borrar todos los pedidos
            const ps = pedidosGlobales.map(p => deleteDoc(doc(db, "pedidos", p.id))); 
            await Promise.all(ps);
        } else if (idParaEliminar?.startsWith("RECHAZAR:")) {
            // Rechazar pedido
            const pedidoId = idParaEliminar.split(":")[1];
            await updateDoc(doc(db, "pedidos", pedidoId), { estado: 'rechazado' });
        } else if (idParaEliminar?.startsWith("INSUMO:")) {
            // Eliminar insumo
            const insumoId = idParaEliminar.split(":")[1];
            await deleteDoc(doc(db, "inventario", insumoId));
        } else if (idParaEliminar) {
            // Eliminar plato de la carta
            await deleteDoc(doc(db, "platos", idParaEliminar));
        }
        
        // Limpiar y cerrar
        idParaEliminar = null; 
        document.getElementById('delete-modal').style.display = 'none';

    } catch (error) {
        console.error("Error al ejecutar la acción:", error);
        alert("Hubo un error al conectar con la base de datos.");
    } finally {
        // Restaurar el botón siempre
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
};
