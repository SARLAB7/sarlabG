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

// --- 2. PEDIDOS, MESAS Y MÉTRICAS ---
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
            btnA = `
            <div style="display:flex; gap:8px;">
                <button onclick="actualizarEstado('${p.id}', 'preparando')" class="btn-estado btn-preparar" style="flex:2;">${ICON_PREPARE} PREPARAR</button>
                <button onclick="rechazarPedido('${p.id}')" class="btn-action" style="flex:1; background: var(--danger); color: white; border: none; font-size: 0.8rem; font-weight: bold;">✕ RECHAZAR</button>
            </div>`;
        } else if (estadoActual === 'preparando') {
            btnA = `
            <div class="grid-pagos" style="margin-bottom: 8px;">
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

// --- FUNCIONES DE ESTADO (PROTEGIDAS) ---
window.actualizarEstado = async (id, estado) => {
    try {
        await updateDoc(doc(db, "pedidos", id), { estado });
        if (estado === 'preparando') {
            procesarDescuentoStock(id); // Importante: sin el "await"
        }
    } catch (error) {
        console.error("Error al actualizar estado:", error);
        alert("Error de conexión al mover el pedido.");
    }
};

window.cerrarPedido = async (id, m) => await updateDoc(doc(db, "pedidos", id), { estado: 'listo', metodoPago: m });
window.revertirPedido = async (id) => await updateDoc(doc(db, "pedidos", id), { estado: 'preparando', metodoPago: null });
window.revertirAPendiente = async (id) => await updateDoc(doc(db, "pedidos", id), { estado: 'pendiente' });
window.rechazarPedido = (id) => { idParaEliminar = "RECHAZAR:" + id; document.getElementById('modal-title').innerHTML = `<span style="color:var(--danger)">¿Rechazar pedido?</span>`; document.getElementById('delete-modal').style.display = 'flex'; };

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

// --- 3. BODEGA, INVENTARIO Y KARDEX ---
function escucharInventario() {
    onSnapshot(collection(db, "inventario"), (snap) => {
        const lista = document.getElementById('lista-insumos');
        if (!lista) return;

        // 1. EL FIX MÁGICO: Evita que el contenedor estire las tarjetas
        lista.style.alignItems = 'start';
        lista.style.gap = '16px'; 

        insumosGlobales = [];
        let htmlLista = '';
        
        snap.forEach(docSnap => {
            const i = docSnap.data(); i.id = docSnap.id; insumosGlobales.push(i);
            const esCritico = Number(i.stockActual) <= Number(i.umbralMinimo);
            const colorCard = esCritico ? '#ef4444' : 'var(--border)';

            // 2. DISEÑO CORREGIDO: Forzamos el fondo oscuro y la altura máxima
            htmlLista += `
                <div style="border: 1px solid ${colorCard}; background: var(--sidebar, #1e293b); border-radius: 16px; position: relative; padding: 20px; height: max-content; width: 100%; box-sizing: border-box;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
                        <span style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">
                            ${i.unidad} ${i.factor ? `(F: ${i.factor})` : ''}
                        </span>
                        <div style="display:flex; gap:12px;">
                            <button onclick="verHistorialInsumo('${i.id}', '${i.nombre}')" style="background:none; border:none; color:var(--accent-yellow); cursor:pointer;">🕒</button>
                            <button onclick="eliminarInsumoModal('${i.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer;">${ICON_TRASH}</button>
                        </div>
                    </div>
                    <div onclick="editarInsumo('${i.id}', '${encodeURIComponent(i.nombre)}', ${i.stockActual}, '${i.unidad}', ${i.umbralMinimo}, ${i.costoUnitario}, ${i.factor || 1})" style="cursor:pointer;">
                        <strong style="font-size: 1.1rem; display: block; color: #ffffff;">
    ${i.nombre} 
    ${esCritico ? `<span style="background: #ef4444; color: white; font-size: 0.6rem; padding: 3px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle; animation: pulse 2s infinite;">⚠️ BAJO STOCK</span>` : ''}
</strong>
                        <div style="font-size: 1.8rem; font-weight: 800; color: ${esCritico ? '#ef4444' : '#ffffff'}; margin: 5px 0;">
                            ${Number(i.stockActual).toLocaleString()}
                        </div>
                        <div style="font-size: 0.75rem; color: #94a3b8;">
                           Costo Prom: $${Math.round(i.costoUnitario || 0).toLocaleString('es-CO')}
                        </div>
                    </div>
                </div>
            `;
        });
        
        lista.innerHTML = htmlLista || '<p style="color:var(--text-muted);">Sin insumos.</p>';
        actualizarSelectoresInsumos();
    });
}

// --- SISTEMA DE NOTIFICACIONES ELEGANTE (INYECCIÓN AUTOMÁTICA) ---
// Crea el contenedor de alertas mágicamente sin tocar el HTML
if (!document.getElementById('iku-toast-container')) {
    const toastContainer = document.createElement('div');
    toastContainer.id = 'iku-toast-container';
    toastContainer.style = "position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;";
    document.body.appendChild(toastContainer);
}

window.mostrarNotificacion = (mensaje, tipo = 'success') => {
    const container = document.getElementById('iku-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const color = tipo === 'success' ? '#10b981' : '#ef4444'; 
    const icono = tipo === 'success' ? '✅' : '❌';
    
    toast.style = `background: var(--card-dark, #1e293b); border-left: 4px solid ${color}; color: white; padding: 16px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 0.9rem; font-weight: 500; display: flex; align-items: center; gap: 12px; transform: translateX(100%); transition: transform 0.3s ease, opacity 0.3s ease; opacity: 0;`;
    toast.innerHTML = `<span style="font-size: 1.2rem;">${icono}</span> <span>${mensaje}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => { toast.style.transform = 'translateX(0)'; toast.style.opacity = '1'; }, 10);
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)'; toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// --- FORMULARIO CREACIÓN DE INSUMOS ---
const formInv = document.getElementById('inv-form');
if(formInv) {
    formInv.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('inv-id').value;
        const btn = formInv.querySelector('button[type="submit"]');
        const txtAnterior = btn.innerText;
        btn.innerText = "Guardando..."; btn.disabled = true;

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
            
            // NOTIFICACIÓN ELEGANTE EN VEZ DEL ALERT FEO
            mostrarNotificacion(id ? "Insumo actualizado correctamente." : "Nuevo insumo guardado.", "success");
            window.cancelarEdicionInv();
        } catch (error) { 
            console.error(error); 
            mostrarNotificacion("Hubo un error al guardar.", "error");
        } finally {
            btn.innerText = txtAnterior; btn.disabled = false;
        }
    };
}

// --- COMPRAS Y AUTO-CÁLCULO DE COSTO INTELIGENTE ---
const formCompra = document.getElementById('f-compra');
const inputCantCompra = document.getElementById('compra-cant');
const selectInsumoCompra = document.getElementById('compra-insumo');
const inputCostoCompra = document.getElementById('compra-costo');

window.calcularCostoCompra = () => {
    if (!inputCantCompra || !selectInsumoCompra || !inputCostoCompra) return;
    const insumo = insumosGlobales.find(i => i.id === selectInsumoCompra.value);
    const cant = Number(inputCantCompra.value);
    
    if (insumo && cant > 0) {
        let costoGuardado = Number(insumo.costoUnitario) || 0;
        let factor = Number(insumo.factor) || 1;
        
        let costoPorEmpaque;
        // MAGIA: Si el costo guardado es muy alto (ej. 20000), el sistema sabe que es el precio 
        // del empaque completo. Si es bajito (ej. 40), sabe que es el precio por gramo.
        if (costoGuardado > 500 && factor > 1) {
            costoPorEmpaque = costoGuardado; 
        } else {
            costoPorEmpaque = costoGuardado * factor;
        }
        
        const costoTotalEstimado = costoPorEmpaque * cant;
        inputCostoCompra.value = Math.round(costoTotalEstimado); 
    } else {
        inputCostoCompra.value = '';
    }
};

if (inputCantCompra) inputCantCompra.addEventListener('input', calcularCostoCompra);
if (selectInsumoCompra) selectInsumoCompra.addEventListener('change', calcularCostoCompra);

if (formCompra) {
    formCompra.onsubmit = async (e) => {
        e.preventDefault();
        const btn = formCompra.querySelector('button[type="submit"]');
        btn.innerText = "Ingresando..."; btn.disabled = true;

        const idInsumo = selectInsumoCompra.value;
        const paquetesRecibidos = Number(inputCantCompra.value);
        const inversionTotal = Number(inputCostoCompra.value);
        
        const inputCaducidad = document.getElementById('compra-caducidad');
        const diasCaducidad = inputCaducidad ? inputCaducidad.value : null;

        const datosInsumo = insumosGlobales.find(i => i.id === idInsumo);
        const contenidoPorEmpaque = Number(datosInsumo.factor) || 1;
        const cantidadTotalIngresada = paquetesRecibidos * contenidoPorEmpaque;
        const nuevoCostoUnitario = inversionTotal / cantidadTotalIngresada;

        let conceptoCompra = `Compra de ${paquetesRecibidos} empaque(s) de ${datosInsumo.nombre}`;
        if (diasCaducidad) {
            const fechaVence = new Date();
            fechaVence.setDate(fechaVence.getDate() + Number(diasCaducidad));
            conceptoCompra += ` | Vence aprox: ${fechaVence.toLocaleDateString()}`;
        }

        try {
            await updateDoc(doc(db, "inventario", idInsumo), {
                stockActual: increment(cantidadTotalIngresada),
                costoUnitario: nuevoCostoUnitario
            });
            await addDoc(collection(db, "kardex"), {
                insumoId: idInsumo, tipo: 'entrada', concepto: conceptoCompra, cantidad: cantidadTotalIngresada, costoReferencia: inversionTotal, timestamp: serverTimestamp()
            });
            
            mostrarNotificacion(`Ingreso exitoso: +${cantidadTotalIngresada.toLocaleString()} ${datosInsumo.unidad}`);
            cerrarModales();
        } catch (error) {
            console.error(error);
            mostrarNotificacion("Error al registrar la compra.", "error");
        } finally {
            btn.innerText = "Ingresar"; btn.disabled = false;
        }
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

// --- FUNCIÓN ROBUSTA DE DESCUENTO ---
async function procesarDescuentoStock(pedidoId) {
    const pedido = pedidosGlobales.find(p => p.id === pedidoId);
    if (!pedido || !pedido.items) return;
    
    for (const item of pedido.items) {
        const platoData = menuGlobal[item.nombre];
        if (platoData && platoData.receta) {
            for (const [insumoId, cantidad] of Object.entries(platoData.receta)) {
                try {
                    await updateDoc(doc(db, "inventario", insumoId), { stockActual: increment(-Number(cantidad)) });
                    await addDoc(collection(db, "kardex"), { insumoId: insumoId, tipo: 'salida', concepto: `Venta: ${item.nombre}`, cantidad: Number(cantidad), timestamp: serverTimestamp() });
                } catch (error) {
                    console.error(`Error descontando insumo ${insumoId} del plato ${item.nombre}:`, error);
                }
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
// --- SISTEMA DE NOTIFICACIONES UI ---
window.mostrarNotificacion = (mensaje, tipo = 'success') => {
    const container = document.getElementById('iku-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const color = tipo === 'success' ? '#10b981' : '#ef4444'; // Verde o Rojo
    const icono = tipo === 'success' ? '✅' : '❌';
    
    toast.style = `background: var(--card-dark, #1e293b); border-left: 4px solid ${color}; color: white; padding: 16px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 0.9rem; font-weight: 500; display: flex; align-items: center; gap: 12px; transform: translateX(100%); transition: transform 0.3s ease, opacity 0.3s ease; opacity: 0;`;
    toast.innerHTML = `<span style="font-size: 1.2rem;">${icono}</span> <span>${mensaje}</span>`;
    
    container.appendChild(toast);
    
    // Animar entrada
    setTimeout(() => { toast.style.transform = 'translateX(0)'; toast.style.opacity = '1'; }, 10);
    // Animar salida y borrar
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)'; toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};
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
window.cerrarModales = () => { 
    document.getElementById('modal-compra').style.display = 'none'; 
    document.getElementById('modal-merma').style.display = 'none'; 
    if(document.getElementById('modal-balance')) document.getElementById('modal-balance').style.display = 'none';
    document.getElementById('f-compra')?.reset(); 
    document.getElementById('f-merma')?.reset(); 
};
window.imprimirComanda = (ps) => { const p = JSON.parse(decodeURIComponent(ps)); const div = document.createElement('div'); div.innerHTML = `<div id="ticket-impresion"><h2 style="text-align:center;">IKU</h2><hr><p><strong>Cliente:</strong> ${p.cliente}</p><hr><ul>${p.items.map(i => `<li>${i.nombre}</li>`).join('')}</ul><hr><h3 style="text-align:right;">Total: $${Number(p.total).toLocaleString()}</h3></div>`; document.body.appendChild(div); window.print(); document.body.removeChild(div); };
window.confirmarReinicioTotal = () => { idParaEliminar = "MASTER"; document.getElementById('modal-title').innerText = '¿REINICIAR TODO?'; document.getElementById('delete-modal').style.display = 'flex'; };

window.confirmarAccionModal = async () => {
    const btn = document.getElementById('confirm-delete-btn');
    const textoOriginal = btn.innerText;
    
    try {
        btn.innerText = "Procesando..."; 
        btn.disabled = true;

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
        
        idParaEliminar = null; 
        document.getElementById('delete-modal').style.display = 'none';

    } catch (error) {
        console.error("Error al ejecutar la acción:", error);
        alert("Hubo un error al conectar con la base de datos.");
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
};

// --- 6. FUNCIÓN DE CIERRE DE CAJA ---
window.generarCierreCaja = async () => {
    const ahora = new Date();
    const ventasHoy = pedidosGlobales.filter(p => {
        if (!p.timestamp || p.estado !== 'listo') return false;
        const f = p.timestamp.toDate();
        return f.getDate() === ahora.getDate() && f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
    });

    if (ventasHoy.length === 0) return alert("No hay ventas cobradas hoy para realizar el cierre.");

    const resumen = ventasHoy.reduce((acc, p) => {
        const m = p.metodoPago || 'indefinido';
        const t = Number(p.total) || 0;
        acc[m] = (acc[m] || 0) + t;
        acc.totalGeneral += t;
        return acc;
    }, { nequi: 0, banco: 0, efectivo: 0, totalGeneral: 0 });

    const conf = confirm(`RESUMEN DE CIERRE:\nEfectivo: $${resumen.efectivo.toLocaleString()}\nNequi: $${resumen.nequi.toLocaleString()}\nBanco: $${resumen.banco.toLocaleString()}\nTOTAL VENTAS: $${resumen.totalGeneral.toLocaleString()}\n\n¿Guardar cierre y finalizar la jornada?`);

    if (conf) {
        try {
            await addDoc(collection(db, "cierres"), {
                fecha: serverTimestamp(),
                totalVentas: resumen.totalGeneral,
                detallePagos: { efectivo: resumen.efectivo, nequi: resumen.nequi, banco: resumen.banco },
                cantidadPedidos: ventasHoy.length,
                usuarioResponsable: auth.currentUser.email
            });
            alert("✅ Cierre de caja guardado exitosamente.");
        } catch (error) {
            console.error("Error al guardar cierre:", error);
            alert("Error al guardar en la base de datos.");
        }
        
    }
};

// --- 7. SECCIÓN DE BALANCE DIARIO, DESCARGA Y AJUSTE MANUAL ---
let datosBalanceActual = [];

window.volverInventario = () => {
    // Busca el botón del menú de inventario y lo clickea para volver suavemente
    const btnInventario = Array.from(document.querySelectorAll('.nav-item')).find(el => el.innerText.includes('Inventario'));
    if (btnInventario) btnInventario.click();
};

window.actualizarStockFisico = async (idInsumo, nuevoStock, stockAnterior, nombreInsumo) => {
    const nuevoVal = Number(nuevoStock);
    const viejoVal = Number(stockAnterior);

    if (nuevoVal === viejoVal) return; // Si no escribes nada nuevo, no hace nada

    const diferencia = nuevoVal - viejoVal;
    const tipoAjuste = diferencia > 0 ? 'entrada' : 'salida';
    
    try {
        // 1. Actualizamos el número en la base de datos
        await updateDoc(doc(db, "inventario", idInsumo), { stockActual: nuevoVal });
        
        // 2. Guardamos el rastro del ajuste manual para auditoría
        await addDoc(collection(db, "kardex"), { 
            insumoId: idInsumo, 
            tipo: tipoAjuste, 
            concepto: `Ajuste Físico (Manual). Valor anterior: ${viejoVal}`, 
            cantidad: Math.abs(diferencia), 
            timestamp: serverTimestamp() 
        });

        mostrarNotificacion(`✅ Stock de ${nombreInsumo} ajustado a ${nuevoVal}`);
        abrirSeccionBalance(); // Recarga los números para que todo cuadre visualmente

    } catch (error) {
        console.error(error);
        mostrarNotificacion("❌ Error al actualizar el inventario", "error");
        abrirSeccionBalance(); // Revierte el input si falla el internet
    }
};

window.abrirSeccionBalance = async () => {window.abrirSeccionBalance = async () => {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.getElementById('v-balance').classList.add('active');
    
    const tbody = document.getElementById('tabla-balance-seccion');
    if(!tbody) return;
    
    const filtro = document.getElementById('filtro-balance')?.value || 'hoy';
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color: var(--text-muted);">Calculando balance para: ${filtro.toUpperCase()}...</td></tr>`;
    
    const ahora = new Date();
    let fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0);
    let fechaFin = null;

    // Lógica del filtro de fechas
    if (filtro === 'ayer') {
        fechaInicio.setDate(fechaInicio.getDate() - 1);
        fechaFin = new Date(fechaInicio);
        fechaFin.setHours(23, 59, 59, 999);
    } else if (filtro === 'semana') {
        fechaInicio.setDate(ahora.getDate() - 7);
    } else if (filtro === 'mes') {
        fechaInicio.setDate(1); // Día 1 de este mes
    } else if (filtro === 'todo') {
        fechaInicio = new Date(2020, 0, 1); // Desde que inició el mundo IKU
    }
    
    try {
        let balance = {}; 
        insumosGlobales.forEach(insumo => {
            balance[insumo.id] = { 
                nombre: insumo.nombre, 
                entradas: 0, salidas: 0, 
                stockActual: insumo.stockActual || 0, 
                unidad: insumo.unidad || '', 
                id: insumo.id, activo: true 
            };
        });

        // Hacemos el query a Firebase usando las fechas calculadas
        let q;
        if (fechaFin) {
            q = query(collection(db, "kardex"), where("timestamp", ">=", fechaInicio), where("timestamp", "<=", fechaFin));
        } else {
            q = query(collection(db, "kardex"), where("timestamp", ">=", fechaInicio));
        }
        
        const snap = await getDocs(q);
        
        snap.forEach(d => {
            const mov = d.data();
            if (balance[mov.insumoId]) {
                if (mov.tipo === 'entrada') balance[mov.insumoId].entradas += Number(mov.cantidad);
                if (mov.tipo === 'salida') balance[mov.insumoId].salidas += Number(mov.cantidad);
            } else {
                balance[mov.insumoId] = { 
                    nombre: 'Insumo Eliminado', 
                    entradas: mov.tipo === 'entrada' ? Number(mov.cantidad) : 0, 
                    salidas: mov.tipo === 'salida' ? Number(mov.cantidad) : 0,
                    stockActual: 0, unidad: '', id: mov.insumoId, activo: false
                };
            }
        });

        datosBalanceActual = Object.values(balance);

        if (datosBalanceActual.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color: var(--text-muted);">No hay insumos en bodega.</td></tr>';
            return;
        }

        let filasHTML = '';
        datosBalanceActual.forEach(b => {
            const isEliminado = !b.activo;
            
            // SEGURIDAD: Solo dejamos editar el stock físico si estamos viendo "Hoy"
            let celdaStockEditable;
            if (isEliminado) {
                celdaStockEditable = `<span style="color: var(--danger)">Eliminado</span>`;
            } else if (filtro === 'hoy') {
                celdaStockEditable = `<input type="number" value="${b.stockActual}" onchange="actualizarStockFisico('${b.id}', this.value, ${b.stockActual}, '${b.nombre}')" style="width: 85px; padding: 6px; text-align: center; border-radius: 8px; border: 2px solid var(--border); background: #0f172a; color: var(--accent-yellow); font-weight: 800; font-size: 1.1rem; cursor: pointer;">`;
            } else {
                celdaStockEditable = `<span style="font-size: 1.1rem; font-weight: 800; color: var(--text-muted);">${b.stockActual}</span>`;
            }

            filasHTML += `
                <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;">
                    <td style="padding: 16px 12px; font-weight: 500; color: var(--white);">
                        ${b.nombre} <br><span style="font-size:0.65rem; color:var(--text-muted); text-transform: uppercase;">${b.unidad}</span>
                    </td>
                    <td style="padding: 16px 12px; text-align: center; color: #22c55e; font-weight: bold;">
                        ${b.entradas > 0 ? '+' : ''}${b.entradas.toLocaleString('es-CO')}
                    </td>
                    <td style="padding: 16px 12px; text-align: center; color: #ef4444; font-weight: bold;">
                        ${b.salidas > 0 ? '-' : ''}${b.salidas.toLocaleString('es-CO')}
                    </td>
                    <td style="padding: 16px 12px; text-align: right;">
                        ${celdaStockEditable}
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = filasHTML;

    } catch (error) {
        console.error("Detalle del error:", error);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color: var(--danger);">Error de conexión: ${error.message}</td></tr>`;
    }
};

window.descargarBalanceCSV = () => {
    if (datosBalanceActual.length === 0) {
        alert("No hay movimientos para descargar en este periodo.");
        return;
    }

    const filtro = document.getElementById('filtro-balance')?.value || 'hoy';
    let csvContent = `Periodo: ${filtro.toUpperCase()}\n`;
    csvContent += "Insumo,Unidad,Entradas,Salidas,Stock Final Actual en Bodega\n";
    
    datosBalanceActual.forEach(b => {
        csvContent += `"${b.nombre}","${b.unidad}","${b.entradas}","${b.salidas}","${b.stockActual}"\n`;
    });

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const fechaActual = new Date().toLocaleDateString('es-CO').replace(/\//g, '-');
    link.setAttribute("href", url);
    link.setAttribute("download", `Inventario_IKU_${filtro}_${fechaActual}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
