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
const correosAutorizados = [CORREO_MASTER, "kelly.araujotafur@gmail.com", "jesusmanuelcd10@gmail.com"];

// Iconos SVG
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

// --- 2. PEDIDOS Y ESTADOS ---
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
        
        let estadoActual = p.estado || 'pendiente';
        const card = document.createElement('div'); 
        card.className = `pedido-card ${estadoActual}`; 
        card.id = `card-${p.id}`;
        
        let btnA = '';
        if (estadoActual === 'pendiente') {
            btnA = `<div style="display:flex; gap:8px;">
                <button onclick="actualizarEstado('${p.id}', 'preparando')" class="btn-estado btn-preparar" style="flex:2;">${ICON_PREPARE} PREPARAR</button>
                <button onclick="rechazarPedido('${p.id}')" class="btn-action" style="flex:1; background: var(--danger); color: white; border: none; font-size: 0.8rem; font-weight: bold;">✕ RECHAZAR</button>
            </div>`;
        } else if (estadoActual === 'preparando') {
            btnA = `<div class="grid-pagos" style="margin-bottom: 8px;">
                <button onclick="cerrarPedido('${p.id}', 'nequi')" class="btn-pago nequi">NEQUI</button>
                <button onclick="cerrarPedido('${p.id}', 'banco')" class="btn-pago banco">BANCO</button>
                <button onclick="cerrarPedido('${p.id}', 'efectivo')" class="btn-pago efectivo">EFECTIVO</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button onclick="revertirAPendiente('${p.id}')" class="btn-action btn-outline" style="flex:1; font-size: 0.75rem; padding: 8px;">↩️ A PENDIENTE</button>
                <button onclick="rechazarPedido('${p.id}')" class="btn-action btn-outline" style="flex:1; color: var(--danger); border-color: var(--danger); font-size: 0.75rem; padding: 8px;">✕ RECHAZAR</button>
            </div>`;
        } else {
            btnA = `<button onclick="revertirPedido('${p.id}')" class="btn-action btn-outline" style="width:100%;">${ICON_PREPARE} REVERTIR A COCINA</button>`;
        }
        
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <strong>${p.cliente}</strong>
                <button onclick="imprimirComanda('${encodeURIComponent(JSON.stringify(p))}')" style="background:none; border:none; cursor:pointer; font-size: 1.2rem;">🖨️</button>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted);">${p.tipo} - $${Number(p.total).toLocaleString()}</div>
            <div style="margin:10px 0;">${(p.items || []).map(i => `<div>• ${i.nombre}</div>`).join('')}</div>
            ${btnA}
        `;
        estadoActual === 'listo' ? la.appendChild(card) : lp.appendChild(card);
    });
}

// --- FUNCIONES DE ESTADO (GLOBALES) ---
window.actualizarEstado = async (id, estado) => {
    if (estado === 'preparando') await procesarDescuentoStock(id);
    await updateDoc(doc(db, "pedidos", id), { estado });
};
window.cerrarPedido = async (id, m) => await updateDoc(doc(db, "pedidos", id), { estado: 'listo', metodoPago: m });
window.revertirPedido = async (id) => await updateDoc(doc(db, "pedidos", id), { estado: 'preparando', metodoPago: null });
window.revertirAPendiente = async (id) => await updateDoc(doc(db, "pedidos", id), { estado: 'pendiente' });
window.rechazarPedido = (id) => { 
    idParaEliminar = "RECHAZAR:" + id; 
    document.getElementById('modal-title').innerHTML = `<span style="color:var(--danger)">¿Rechazar pedido?</span>`; 
    document.getElementById('delete-modal').style.display = 'flex'; 
};

// --- MÉTRICAS Y MESAS ---
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

// --- BODEGA E INVENTARIO ---
function escucharInventario() {
    onSnapshot(collection(db, "inventario"), (snap) => {
        const lista = document.getElementById('lista-insumos');
        if (!lista) return;
        insumosGlobales = [];
        let htmlLista = '';
        snap.forEach(docSnap => {
            const i = docSnap.data(); i.id = docSnap.id; insumosGlobales.push(i);
            const esCritico = Number(i.stockActual) <= Number(i.umbralMinimo);
            htmlLista += `
                <div class="stat-card" style="border: 1px solid ${esCritico ? 'var(--danger)' : 'var(--border)'}; position: relative; padding: 20px;">
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
                        <div style="font-size: 0.7rem; color: var(--text-muted);">Costo Prom: $${Number(i.costoUnitario || 0).toFixed(2)}</div>
                    </div>
                </div>`;
        });
        lista.innerHTML = htmlLista || '<p style="color:var(--text-muted);">Sin insumos.</p>';
        actualizarSelectoresInsumos();
    });
}

// --- CONFIRMACIÓN Y CIERRE ---
window.confirmarAccionModal = async () => {
    const btn = document.getElementById('confirm-delete-btn');
    const textoOriginal = btn.innerText;
    try {
        btn.innerText = "Procesando..."; btn.disabled = true;
        if (idParaEliminar === "MASTER") {
            const ps = pedidosGlobales.map(p => deleteDoc(doc(db, "pedidos", p.id))); 
            await Promise.all(ps);
        } else if (idParaEliminar?.startsWith("RECHAZAR:")) {
            const pedidoId = idParaEliminar.split(":")[1];
            await updateDoc(doc(db, "pedidos", pedidoId), { estado: 'rechazado' });
        } else if (idParaEliminar?.startsWith("INSUMO:")) {
            const insumoId = idParaEliminar.split(":")[1];
            await deleteDoc(doc(db, "inventario", insumoId));
        } else if (idParaEliminar) {
            await deleteDoc(doc(db, "platos", idParaEliminar));
        }
        idParaEliminar = null; document.getElementById('delete-modal').style.display = 'none';
    } catch (error) {
        console.error("Error:", error);
        alert("Error al conectar con la base de datos.");
    } finally {
        btn.innerText = textoOriginal; btn.disabled = false;
    }
};

// ... Otras utilidades (escucharCarta, editarPlato, etc.) ...
// IMPORTANTE: Asegúrate de que no haya nada de texto suelto al final del archivo.
