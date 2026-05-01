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

// --- ICONOS ---
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

// --- 2. KARDEX Y AUDITORÍA ---
window.verHistorialInsumo = async (id, nombre) => {
    const seccion = document.getElementById('seccion-kardex');
    const tablaBody = document.getElementById('tabla-kardex-body');
    seccion.style.display = 'block';
    seccion.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('kardex-titulo').innerText = `Historial: ${nombre}`;
    tablaBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Consultando...</td></tr>';

    try {
        const q = query(collection(db, "kardex"), where("insumoId", "==", id), orderBy("timestamp", "desc"), limit(20));
        const snap = await getDocs(q);
        let rows = '';
        snap.forEach(d => {
            const m = d.data();
            const fecha = m.timestamp?.toDate().toLocaleString() || 'Reciente';
            const esEntrada = m.tipo === 'entrada';
            rows += `<tr>
                <td style="padding:12px; color:#94a3b8;">${fecha}</td>
                <td style="padding:12px;">${m.concepto}</td>
                <td style="padding:12px; color:${esEntrada ? '#22c55e' : '#ef4444'}">${m.tipo.toUpperCase()}</td>
                <td style="padding:12px; text-align:right;">${esEntrada ? '+' : '-'}${m.cantidad}</td>
            </tr>`;
        });
        tablaBody.innerHTML = rows || '<tr><td colspan="4" style="text-align:center;">Sin movimientos.</td></tr>';
    } catch (e) { console.error(e); }
};

// --- 3. GESTIÓN DE INVENTARIO ---
function escucharInventario() {
    onSnapshot(collection(db, "inventario"), (snap) => {
        const lista = document.getElementById('lista-insumos');
        if (!lista) return;
        insumosGlobales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        let html = '';
        insumosGlobales.forEach(i => {
            const esCritico = Number(i.stockActual) <= Number(i.umbralMinimo);
            html += `<div class="stat-card" style="border: 1px solid ${esCritico ? '#ef4444' : 'rgba(255,255,255,0.1)'};">
                <div style="display:flex; justify-content:space-between;">
                    <span style="font-size:0.6rem; color:#94a3b8;">${i.unidad.toUpperCase()}</span>
                    <div>
                        <button onclick="verHistorialInsumo('${i.id}', '${i.nombre}')" style="background:none; border:none; cursor:pointer;">🕒</button>
                        <button onclick="eliminarInsumoModal('${i.id}')" style="background:none; border:none; cursor:pointer; color:#ef4444;">${ICON_TRASH}</button>
                    </div>
                </div>
                <strong onclick="editarInsumo('${i.id}', '${encodeURIComponent(i.nombre)}', ${i.stockActual}, '${i.unidad}', ${i.umbralMinimo}, ${i.costoUnitario}, ${i.factor || 1})" style="cursor:pointer; display:block; margin:5px 0;">${i.nombre}</strong>
                <div style="font-size:1.5rem; font-weight:700;">${i.stockActual.toLocaleString()}</div>
            </div>`;
        });
        lista.innerHTML = html;
        actualizarSelectoresInsumos();
    });
}

const formCompra = document.getElementById('f-compra');
if(formCompra) {
    formCompra.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('compra-insumo').value;
        const cant = Number(document.getElementById('compra-cant').value);
        const costo = Number(document.getElementById('compra-costo').value);
        const ins = insumosGlobales.find(i => i.id === id);
        const totalVenta = cant * (ins.factor || 1);

        await updateDoc(doc(db, "inventario", id), {
            stockActual: increment(totalVenta),
            costoUnitario: costo / totalVenta
        });
        await addDoc(collection(db, "kardex"), { insumoId: id, tipo: 'entrada', concepto: 'Compra Stock', cantidad: totalVenta, timestamp: serverTimestamp() });
        cerrarModales();
    };
}

const formMerma = document.getElementById('f-merma');
if(formMerma) {
    formMerma.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('merma-insumo').value;
        const cant = Number(document.getElementById('merma-cant').value);
        const mot = document.getElementById('merma-motivo').value;

        await updateDoc(doc(db, "inventario", id), { stockActual: increment(-cant) });
        await addDoc(collection(db, "kardex"), { insumoId: id, tipo: 'salida', concepto: `Merma: ${mot}`, cantidad: cant, timestamp: serverTimestamp() });
        cerrarModales();
    };
}

// --- 4. PROCESAR VENTAS (DESCUENTO AUTOMÁTICO) ---
async function procesarDescuentoStock(pedidoId) {
    const p = pedidosGlobales.find(x => x.id === pedidoId);
    if (!p) return;
    for (const item of p.items) {
        const plato = menuGlobal[item.nombre];
        if (plato?.receta) {
            for (const [insId, cant] of Object.entries(plato.receta)) {
                await updateDoc(doc(db, "inventario", insId), { stockActual: increment(-cant) });
                await addDoc(collection(db, "kardex"), { insumoId: insId, tipo: 'salida', concepto: `Venta: ${item.nombre}`, cantidad: cant, timestamp: serverTimestamp() });
            }
        }
    }
}

// --- 5. CARTA Y RECETAS ---
window.agregarFilaReceta = (insId = '', cant = '') => {
    const div = document.createElement('div');
    div.className = 'fila-receta';
    div.style = "display:flex; gap:5px; margin-bottom:5px;";
    let opts = insumosGlobales.map(i => `<option value="${i.id}" ${i.id === insId ? 'selected' : ''}>${i.nombre}</option>`).join('');
    div.innerHTML = `<select class="receta-insumo" style="flex:2;">${opts}</select><input type="number" class="receta-cantidad" value="${cant}" style="flex:1;" step="any"><button type="button" onclick="this.parentElement.remove()" style="color:#ef4444; background:none; border:none;">✕</button>`;
    document.getElementById('receta-items').appendChild(div);
};

// --- RESTO DE FUNCIONES (UI, PEDIDOS, MÉTRICAS) ---
function escucharCarta() {
    onSnapshot(collection(db, "platos"), (snap) => {
        const list = document.getElementById('inv-list'); if (!list) return;
        let html = '';
        snap.forEach(d => {
            const it = d.data(); it.id = d.id; menuGlobal[it.nombre] = it;
            html += `<div class="plato-row" style="background:var(--sidebar); padding:10px; border-radius:10px; margin-bottom:5px; display:flex; justify-content:space-between;">
                <span>${it.nombre} ($${it.precio})</span>
                <button onclick="editarPlato('${it.id}', '${encodeURIComponent(it.nombre)}', ${it.precio}, '${it.categoria}', '', '', '${encodeURIComponent(JSON.stringify(it.receta || {}))}')" style="background:none; border:none; color:#3b82f6; cursor:pointer;">${ICON_EDIT}</button>
            </div>`;
        });
        list.innerHTML = html;
    });
}

window.editarPlato = (id, n, p, c, d, i, r) => {
    document.getElementById('edit-id').value = id;
    document.getElementById('name').value = decodeURIComponent(n);
    document.getElementById('price').value = p;
    document.getElementById('category').value = c;
    const items = document.getElementById('receta-items'); items.innerHTML = '';
    const receta = JSON.parse(decodeURIComponent(r || '{}'));
    Object.entries(receta).forEach(([insId, cant]) => agregarFilaReceta(insId, cant));
    document.getElementById('f-title').innerText = "Editando Plato";
};

window.actualizarEstado = async (id, est) => {
    if (est === 'preparando') await procesarDescuentoStock(id);
    await updateDoc(doc(db, "pedidos", id), { estado: est });
};

function escucharPedidos() {
    onSnapshot(query(collection(db, "pedidos"), orderBy("timestamp", "desc")), (snap) => {
        pedidosGlobales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const lp = document.getElementById('l-pendientes'), la = document.getElementById('l-atendidos');
        if(!lp || !la) return; lp.innerHTML = ''; la.innerHTML = '';
        pedidosGlobales.forEach(p => {
            if (p.estado === 'rechazado') return;
            const card = document.createElement('div'); card.className = `pedido-card ${p.estado}`;
            card.innerHTML = `<strong>${p.cliente}</strong><br>${p.items.map(i => i.nombre).join(', ')}<br>
            ${p.estado === 'pendiente' ? `<button onclick="actualizarEstado('${p.id}', 'preparando')" class="btn-action btn-primary">PREPARAR</button>` : ''}
            ${p.estado === 'preparando' ? `<button onclick="cerrarPedido('${p.id}', 'efectivo')" class="btn-action btn-success">LISTO (Efectivo)</button>` : ''}`;
            p.estado === 'listo' ? la.appendChild(card) : lp.appendChild(card);
        });
        actualizarMétricas();
    });
}

window.actualizarMétricas = () => {
    let t = 0; pedidosGlobales.filter(p => p.estado === 'listo').forEach(p => t += p.total);
    document.getElementById('s-hoy').innerText = `$${t.toLocaleString()}`;
};

window.abrirModalCompra = () => { actualizarSelectoresInsumos(); document.getElementById('modal-compra').style.display='flex'; };
window.abrirModalMerma = () => { actualizarSelectoresInsumos(); document.getElementById('modal-merma').style.display='flex'; };
window.cerrarModales = () => { document.getElementById('modal-compra').style.display='none'; document.getElementById('modal-merma').style.display='none'; };
window.actualizarSelectoresInsumos = () => {
    const opts = insumosGlobales.map(i => `<option value="${i.id}">${i.nombre}</option>`).join('');
    document.getElementById('compra-insumo').innerHTML = opts; document.getElementById('merma-insumo').innerHTML = opts;
};
window.cancelarEdicionInv = () => { document.getElementById('inv-form').reset(); document.getElementById('btn-cancelar-inv').style.display='none'; };