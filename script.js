import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

let carrito = [];
const ICON_TRASH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

const SOUND_ADD = document.createElement('audio');
SOUND_ADD.src = 'https://assets.mixkit.co/sfx/preview/mixkit-bubble-pop-up-alert-2358.mp3';
SOUND_ADD.preload = 'auto';
document.body.appendChild(SOUND_ADD);

// CONFIGURACIÓN DE DOMICILIOS
const IKU_COORDS = { lat: 10.4216, lng: -73.6885 }; // Pueblo Bello, Cesar
const RADIO_MAXIMO_KM = 15; // Ajusta el radio de entrega aquí
let ubicacionCliente = null;

// DETECTAR MODO DOMICILIO POR URL (?tipo=domicilio)
const params = new URLSearchParams(window.location.search);
const esDomicilioForzado = params.get('tipo') === 'domicilio';
// --- INICIALIZACIÓN ---
document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const mesaParam = params.get('mesa');
    if (mesaParam) {
        const inputNombre = document.getElementById('nombre-cliente');
        const selectTipo = document.getElementById('tipo-servicio');
        if (inputNombre && selectTipo) {
            selectTipo.value = 'mesa';
            inputNombre.value = "Mesa " + mesaParam;
            inputNombre.readOnly = true;
            inputNombre.style.backgroundColor = "#f1f5f9";
        }
    }
});

// --- INTERFAZ ---
window.toggleDish = (header) => {
    const dish = header.parentElement;
    const isOpened = dish.classList.contains('expanded');
    document.querySelectorAll('.dish-item').forEach(i => i.classList.remove('expanded'));
    if (!isOpened) dish.classList.add('expanded');
};
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function validarRango() {
    if (!ubicacionCliente) return true;
    const dist = calcularDistancia(IKU_COORDS.lat, IKU_COORDS.lng, ubicacionCliente.lat, ubicacionCliente.lng);
    
    if (dist > RADIO_MAXIMO_KM) {
        alert(`Lo sentimos, estás a ${dist.toFixed(1)}km. Solo entregamos en Pueblo Bello (máx ${RADIO_MAXIMO_KM}km).`);
        document.querySelector('.btn-send-order').disabled = true;
        document.querySelector('.btn-send-order').innerText = "FUERA DE COBERTURA";
        return false;
    }
    return true;
}
window.toggleCart = () => document.getElementById('cart-modal').classList.toggle('open');
window.cerrarTracker = () => document.getElementById('tracker-modal').classList.remove('open');

window.ajustarCant = (id, delta) => {
    const el = document.getElementById(`cant-${id}`);
    if(!el) return;
    let cant = parseInt(el.innerText) + delta;
    if(cant < 1) cant = 1; 
    el.innerText = cant;
};

// --- LÓGICA DE CARRITO ---
window.agregarAlCarrito = (nombre, precio, id) => {
    const qtySpan = document.getElementById(`cant-${id}`);
    const cantidad = qtySpan ? parseInt(qtySpan.innerText) : 1;
    const excluidos = Array.from(document.querySelectorAll(`#dish-${id} .ing-pill.excluido`)).map(el => el.innerText);
    
    const existeIndex = carrito.findIndex(i => i.nombre === nombre && JSON.stringify(i.excluidos) === JSON.stringify(excluidos));
    
    if(existeIndex !== -1) {
        carrito[existeIndex].cantidad += cantidad; 
    } else {
        carrito.push({ nombre, precio: Number(precio), cantidad: cantidad, id, excluidos });
    }
    
    if(qtySpan) qtySpan.innerText = "1"; 
    document.querySelectorAll(`#dish-${id} .ing-pill.excluido`).forEach(el => el.classList.remove('excluido'));
    
    SOUND_ADD.currentTime = 0;
    SOUND_ADD.play().catch(e => console.log('Audio error'));

    const cartFab = document.querySelector('.cart-fab');
    if (cartFab) {
        cartFab.classList.remove('cart-bounce');
        void cartFab.offsetWidth; 
        cartFab.classList.add('cart-bounce');
    }
    actualizarCarrito();
};

function actualizarCarrito() {
    const cont = document.getElementById('cart-items');
    const priceEl = document.getElementById('cart-total-price');
    const countEl = document.getElementById('cart-count');
    const totalItems = carrito.reduce((acc, item) => acc + item.cantidad, 0);
    if(countEl) countEl.innerText = totalItems;
    if(!cont) return;
    cont.innerHTML = '';
    let total = 0;
    carrito.forEach((item, i) => {
        total += (item.precio * item.cantidad);
        const excluidosStr = item.excluidos && item.excluidos.length > 0 
            ? `<div style="color:#ef4444; font-size:0.75rem; font-weight:600; margin-top:4px;">❌ Sin: ${item.excluidos.join(', ')}</div>` 
            : '';
        cont.innerHTML += `
        <div class="cart-item-row">
            <div><strong style="font-size:1.05rem;">${item.cantidad}x ${item.nombre}</strong>${excluidosStr}</div>
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="color:#22c55e; font-weight:700;">$${(item.precio * item.cantidad).toLocaleString()}</span>
                <button onclick="quitar(${i})" class="btn-remove-item">${ICON_TRASH}</button>
            </div>
        </div>`;
    });
    if(priceEl) priceEl.innerText = `$${total.toLocaleString()}`;
}

window.quitar = (i) => { carrito.splice(i, 1); actualizarCarrito(); };

// --- ENVÍO DE PEDIDO ---
window.enviarPedido = async () => {
    const cliente = document.getElementById('nombre-cliente')?.value;
    const tipo = document.getElementById('tipo-servicio')?.value;
    const quiereWA = document.getElementById('check-whatsapp')?.checked;
    const btn = document.querySelector('.btn-send-order');
    const textoOriginal = btn.innerHTML;

    if (!cliente || carrito.length === 0) { 
        btn.innerHTML = "Faltan datos ⚠️"; 
        setTimeout(() => btn.innerHTML = textoOriginal, 2000); 
        return; 
    }
window.enviarPedido = async () => {
    // ... validaciones previas ...
    
    if (esDomicilioForzado && !validarRango()) return;

    // Crear el link de ubicación si existe
    const linkMapa = ubicacionCliente 
        ? `%0A📍 *Ubicación en tiempo real:* https://www.google.com/maps?q=${ubicacionCliente.lat},${ubicacionCliente.lng}` 
        : "";

    // Formatear mensaje como un Ticket
    let msgWA = `*🧾 TICKET DE PEDIDO - IKU*%0A`;
    msgWA += `*Cliente:* ${cliente}%0A`;
    msgWA += `*Servicio:* ${tipo.toUpperCase()}%0A`;
    msgWA += `--------------------------------%0A`;
    
    carrito.forEach(i => { 
        msgWA += `*${i.cantidad}x* ${i.nombre}%0A`;
        if(i.excluidos.length > 0) msgWA += `   _SIN: ${i.excluidos.join(', ')}_%0A`;
    });

    msgWA += `--------------------------------%0A`;
    msgWA += `*TOTAL A PAGAR:* $${total.toLocaleString()}%0A`;
    msgWA += linkMapa;
    msgWA += `%0A%0A_Por favor, confirma este pedido para iniciar la preparación._`;

    // 1. Guardar en Firebase (como respaldo para el Admin)
    try {
        await addDoc(collection(db, "pedidos"), { ... });
        
        // 2. Lanzar a WhatsApp
        window.open(`https://wa.me/573017177781?text=${msgWA}`);
        
        // ... limpiar carrito y cerrar ...
    } catch (e) { console.error(e); }
};
    const total = carrito.reduce((s, x) => s + (x.precio * x.cantidad), 0);
    let itemsParaEnviar = [];
    carrito.forEach(item => {
        for(let k = 0; k < item.cantidad; k++) {
            itemsParaEnviar.push({
                nombre: item.nombre,
                precio: item.precio,
                excluidos: item.excluidos || []
            });
        }
    });

    try {
        btn.innerHTML = "Enviando... ⏳";
        const docRef = await addDoc(collection(db, "pedidos"), { 
            cliente, tipo, items: itemsParaEnviar, total, estado: "pendiente", timestamp: serverTimestamp() 
        });
        if (quiereWA) {
            let msgWA = `*NUEVO PEDIDO SAR*%0A*Cliente:* ${cliente}%0A------------------%0A`;
            carrito.forEach(i => { msgWA += `• ${i.cantidad}x ${i.nombre} ${i.excluidos.length > 0 ? `(SIN: ${i.excluidos.join(', ')})` : ''}%0A`; });
            msgWA += `------------------%0A*Total:* $${total.toLocaleString()}`;
            window.open(`https://wa.me/573017177781?text=${msgWA}`);
        }
        btn.innerHTML = "¡Pedido enviado! ✅";
        setTimeout(() => {
            carrito = []; 
            actualizarCarrito();
            window.toggleCart(); 
            btn.innerHTML = textoOriginal;
            iniciarTracker(docRef.id);
        }, 1500);
    } catch (e) { btn.innerHTML = "Error ❌"; }
};

window.iniciarTracker = (id) => {
    document.getElementById('tracker-modal').classList.add('open');
    onSnapshot(doc(db, "pedidos", id), (docSnap) => {
        if(docSnap.exists()) {
            const p = docSnap.data();
            const tit = document.getElementById('tracker-status');
            const desc = document.getElementById('tracker-desc');
            const icn = document.getElementById('tracker-icon');
            if(p.estado === 'preparando') {
                tit.innerText = "Preparando"; desc.innerText = "¡Tu pedido ya está en la cocina!"; icn.innerText = "🍳";
            } else if (p.estado === 'listo') {
                tit.innerText = "¡Pedido Listo!"; desc.innerText = "Tu pedido está listo para ser entregado."; icn.innerText = "✅";
                setTimeout(() => window.cerrarTracker(), 5000);
            }
        }
    });
};

// --- CARGA DINÁMICA DEL MENÚ (CORREGIDA) ---
onSnapshot(query(collection(db, "platos"), orderBy("nombre", "asc")), (snap) => {
    const categoriasIds = ['diario', 'almuerzo' , 'desayuno', 'especial', 'asado', 'rapida', 'bebida'];
    
    // 1. Limpieza total inmediata
    categoriasIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = '';
    });

    document.getElementById('loader').style.display = 'none';

    // 2. Reparto de platos
    snap.forEach(docSnap => {
        const d = docSnap.data();
        if(d.disponible === false) return; 

        let ingredientesHTML = '';
        if (d.ingredientes && d.ingredientes.length > 0) {
            ingredientesHTML = `
            <div style="margin-bottom: 16px; padding-top: 10px; border-top: 1px dashed #eee;">
                <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px; font-weight:600;">Ingredientes <span style="font-weight:400;">(Toca para quitar)</span>:</div>
                <div class="ing-container">
                    ${d.ingredientes.map(i => `<span class="ing-pill" onclick="event.stopPropagation(); this.classList.toggle('excluido')">${i}</span>`).join('')}
                </div>
            </div>`;
        }

        const html = `
        <div class="dish-item" id="dish-${docSnap.id}">
            <div class="dish-header" onclick="toggleDish(this)">
                <div style="flex:1; padding-right:10px;">
                    <h3>${d.nombre}</h3>
                    <p style="font-size:0.9rem; color:var(--text-muted);">${d.descripcion || ''}</p>
                </div>
                <strong class="dish-price">$${Number(d.precio).toLocaleString()}</strong>
            </div>
            <div class="expand-content">
                ${ingredientesHTML}
                <div class="qty-wrapper">
                    <span class="qty-label">Cantidad:</span>
                    <div class="qty-control">
                        <button onclick="ajustarCant('${docSnap.id}', -1)" class="btn-qty">-</button>
                        <span id="cant-${docSnap.id}" class="qty-num">1</span>
                        <button onclick="ajustarCant('${docSnap.id}', 1)" class="btn-qty">+</button>
                    </div>
                </div>
                <button class="btn-add-cart" onclick="agregarAlCarrito('${d.nombre}', '${d.precio}', '${docSnap.id}')">AÑADIR AL PEDIDO</button>
            </div>
        </div>`;
        
        const container = document.getElementById(d.categoria);
        if(container) container.insertAdjacentHTML('beforeend', html);
    });

    // 3. Forzar visibilidad correcta según el botón activo
    const tabActiva = document.querySelector('.tab-btn.active').dataset.tab;
    document.querySelectorAll('.menu-section').forEach(s => {
        s.style.display = (s.id === tabActiva) ? 'block' : 'none';
    });
});

// --- CAMBIO DE TABS (MEJORADO) ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        const target = btn.dataset.tab;
        // Botones
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Secciones
        document.querySelectorAll('.menu-section').forEach(s => {
            if(s.id === target) {
                s.style.display = 'block';
                setTimeout(() => s.classList.add('active'), 10);
            } else {
                s.style.display = 'none';
                s.classList.remove('active');
            }
            document.addEventListener("DOMContentLoaded", () => {
    const inputNombre = document.getElementById('nombre-cliente');
    const selectTipo = document.getElementById('tipo-servicio');

    if (esDomicilioForzado) {
        selectTipo.value = 'domicilio';
        selectTipo.disabled = true; // Bloquea el cambio a "Mesa"
        inputNombre.placeholder = "Nombre y Dirección exacta";
        
        // Pedir ubicación de inmediato para validar rango
        solicitarUbicacion();
    }
    // ... tu lógica existente de mesa ...
});

function solicitarUbicacion() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            ubicacionCliente = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            };
            validarRango();
        }, (err) => {
            alert("Para domicilios, necesitamos tu ubicación para verificar si estamos en cobertura.");
        });
    }
}
        });
    };
});
