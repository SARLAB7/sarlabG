import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// --- CONFIGURACIÓN Y ESTADO ---
let carrito = [];
const IKU_COORDS = { lat: 6.2442, lng: -75.5812 }; // Coordenadas centrales de Medellín
const RADIO_MAXIMO_KM = 10; // Ponle 10km para abarcar gran parte de la ciudad en tu prueba
let ubicacionCliente = null;

const ICON_TRASH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
const SOUND_ADD = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-bubble-pop-up-alert-2358.mp3');

const params = new URLSearchParams(window.location.search);
const esDomicilioForzado = params.get('tipo') === 'domicilio';
const mesaParam = params.get('mesa');

// --- INICIALIZACIÓN ---
document.addEventListener("DOMContentLoaded", () => {
    const inputNombre = document.getElementById('nombre-cliente');
    const selectTipo = document.getElementById('tipo-servicio');

    if (esDomicilioForzado) {
        selectTipo.value = 'domicilio';
        selectTipo.disabled = true; 
        inputNombre.placeholder = "Nombre y Dirección exacta";
        solicitarUbicacion();
    } else if (mesaParam) {
        selectTipo.value = 'mesa';
        inputNombre.value = "Mesa " + mesaParam;
        inputNombre.readOnly = true;
        inputNombre.style.backgroundColor = "#1f222a";
    }
});

// --- GEOLOCALIZACIÓN Y RANGO ---
function solicitarUbicacion() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            ubicacionCliente = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            validarRango();
        }, () => {
            // Cambiamos el texto aquí
            alert("Para domicilios, activa el GPS para verificar cobertura en Medellín.");
        });
    }
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function validarRango() {
    if (!ubicacionCliente) return true;
    const dist = calcularDistancia(IKU_COORDS.lat, IKU_COORDS.lng, ubicacionCliente.lat, ubicacionCliente.lng);
    
    if (dist > RADIO_MAXIMO_KM) {
        const btn = document.querySelector('.btn-send-order');
        // Cambiamos el texto aquí
        alert(`Fuera de rango: Estás a ${dist.toFixed(1)}km. Solo entregamos en Medellín (máx ${RADIO_MAXIMO_KM}km).`);
        btn.disabled = true;
        btn.innerText = "FUERA DE COBERTURA";
        return false;
    }
    return true;
}

// --- INTERFAZ Y CARRITO ---
window.toggleDish = (header) => {
    const dish = header.parentElement;
    const isOpened = dish.classList.contains('expanded');
    document.querySelectorAll('.dish-item').forEach(i => i.classList.remove('expanded'));
    if (!isOpened) dish.classList.add('expanded');
};

window.toggleCart = () => document.getElementById('cart-modal').classList.toggle('open');
window.cerrarTracker = () => document.getElementById('tracker-modal').classList.remove('open');

window.ajustarCant = (id, delta) => {
    const el = document.getElementById(`cant-${id}`);
    let cant = (parseInt(el.innerText) || 1) + delta;
    el.innerText = cant < 1 ? 1 : cant;
};

window.agregarAlCarrito = (nombre, precio, id) => {
    const qtySpan = document.getElementById(`cant-${id}`);
    const cantidad = parseInt(qtySpan.innerText);
    const excluidos = Array.from(document.querySelectorAll(`#dish-${id} .ing-pill.excluido`)).map(el => el.innerText);
    
    const existe = carrito.find(i => i.nombre === nombre && JSON.stringify(i.excluidos) === JSON.stringify(excluidos));
    if(existe) existe.cantidad += cantidad;
    else carrito.push({ nombre, precio: Number(precio), cantidad, id, excluidos });
    
    qtySpan.innerText = "1";
    document.querySelectorAll(`#dish-${id} .ing-pill.excluido`).forEach(el => el.classList.remove('excluido'));
    SOUND_ADD.play();
    actualizarCarrito();
};

function actualizarCarrito() {
    const cont = document.getElementById('cart-items');
    const priceEl = document.getElementById('cart-total-price');
    const countEl = document.getElementById('cart-count');
    let total = 0;

    cont.innerHTML = '';
    carrito.forEach((item, i) => {
        total += (item.precio * item.cantidad);
        cont.innerHTML += `
        <div class="cart-item-row">
            <div><strong>${item.cantidad}x ${item.nombre}</strong>
            ${item.excluidos.length ? `<div style="color:var(--danger); font-size:0.75rem;">❌ Sin: ${item.excluidos.join(', ')}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="color:var(--success); font-weight:700;">$${(item.precio * item.cantidad).toLocaleString()}</span>
                <button onclick="quitar(${i})" class="btn-remove-item">${ICON_TRASH}</button>
            </div>
        </div>`;
    });
    if(countEl) countEl.innerText = carrito.reduce((acc, item) => acc + item.cantidad, 0);
    if(priceEl) priceEl.innerText = `$${total.toLocaleString()}`;
}

window.quitar = (i) => { carrito.splice(i, 1); actualizarCarrito(); };

// --- ENVÍO DE PEDIDO (SISTEMA DUAL) ---
window.enviarPedido = async () => {
    const cliente = document.getElementById('nombre-cliente')?.value;
    const tipo = document.getElementById('tipo-servicio')?.value;
    const btn = document.querySelector('.btn-send-order');

    if (!cliente || carrito.length === 0) {
        btn.innerText = "Faltan datos ⚠️";
        setTimeout(() => btn.innerText = "CONFIRMAR PEDIDO", 2000);
        return;
    }

    if (esDomicilioForzado && !validarRango()) return;

    const total = carrito.reduce((s, x) => s + (x.precio * x.cantidad), 0);
    const linkMapa = ubicacionCliente ? `%0A📍 *Ubicación GPS:* https://www.google.com/maps?q=${ubicacionCliente.lat},${ubicacionCliente.lng}` : "";

    // Formatear Ticket para WhatsApp
    let msgWA = `*🧾 TICKET DE PEDIDO - IKU*%0A`;
    msgWA += `*Cliente:* ${cliente}%0A`;
    msgWA += `*Servicio:* ${tipo.toUpperCase()}%0A`;
    msgWA += `--------------------------------%0A`;
    carrito.forEach(i => {
        msgWA += `*${i.cantidad}x* ${i.nombre}%0A`;
        if(i.excluidos.length) msgWA += `   _SIN: ${i.excluidos.join(', ')}_%0A`;
    });
    msgWA += `--------------------------------%0A`;
    msgWA += `*TOTAL:* $${total.toLocaleString()}${linkMapa}%0A%0A_Por favor, confirma para iniciar preparación._`;

    try {
        btn.innerText = "Enviando... ⏳";
        const docRef = await addDoc(collection(db, "pedidos"), {
            cliente, tipo, total,
            items: carrito.flatMap(i => Array(i.cantidad).fill({ nombre: i.nombre, precio: i.precio, excluidos: i.excluidos })),
            estado: "pendiente", timestamp: serverTimestamp()
        });

        window.open(`https://wa.me/573017177781?text=${msgWA}`);

        carrito = [];
        actualizarCarrito();
        window.toggleCart();
        btn.innerText = "CONFIRMAR PEDIDO";
        iniciarTracker(docRef.id);
    } catch (e) { btn.innerText = "Error ❌"; }
};

// --- TRACKER Y CARGA DE MENÚ ---
window.iniciarTracker = (id) => {
    document.getElementById('tracker-modal').classList.add('open');
    onSnapshot(doc(db, "pedidos", id), (snap) => {
        if(snap.exists()) {
            const p = snap.data();
            const tit = document.getElementById('tracker-status'), desc = document.getElementById('tracker-desc'), icn = document.getElementById('tracker-icon');
            if(p.estado === 'preparando') { tit.innerText = "En Cocina"; desc.innerText = "¡Tu pedido se está preparando!"; icn.innerText = "🍳"; }
            else if (p.estado === 'listo') { tit.innerText = "¡Listo!"; desc.innerText = "Tu pedido está saliendo."; icn.innerText = "✅"; setTimeout(() => cerrarTracker(), 5000); }
        }
    });
};

onSnapshot(query(collection(db, "platos"), orderBy("nombre", "asc")), (snap) => {
    const categorias = ['diario', 'almuerzo' , 'desayuno', 'especial', 'asado', 'rapida', 'bebida'];
    categorias.forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = ''; });
    document.getElementById('loader').style.display = 'none';

    snap.forEach(docSnap => {
        const d = docSnap.data();
        if(d.disponible === false) return;
        const html = `
        <div class="dish-item" id="dish-${docSnap.id}">
            <div class="dish-header" onclick="toggleDish(this)">
                <div style="flex:1;"><h3>${d.nombre}</h3><p>${d.descripcion || ''}</p></div>
                <strong class="dish-price">$${Number(d.precio).toLocaleString()}</strong>
            </div>
            <div class="expand-content">
                ${d.ingredientes?.length ? `<div class="ing-container">${d.ingredientes.map(i => `<span class="ing-pill" onclick="event.stopPropagation(); this.classList.toggle('excluido')">${i}</span>`).join('')}</div>` : ''}
                <div class="qty-wrapper"><div class="qty-control"><button onclick="ajustarCant('${docSnap.id}', -1)" class="btn-qty">-</button><span id="cant-${docSnap.id}" class="qty-num">1</span><button onclick="ajustarCant('${docSnap.id}', 1)" class="btn-qty">+</button></div></div>
                <button class="btn-add-cart" onclick="agregarAlCarrito('${d.nombre}', '${d.precio}', '${docSnap.id}')">AÑADIR</button>
            </div>
        </div>`;
        const container = document.getElementById(d.categoria);
        if(container) container.insertAdjacentHTML('beforeend', html);
    });
    
    const tabActiva = document.querySelector('.tab-btn.active').dataset.tab;
    document.querySelectorAll('.menu-section').forEach(s => s.style.display = s.id === tabActiva ? 'block' : 'none');
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.menu-section').forEach(s => s.style.display = s.id === btn.dataset.tab ? 'block' : 'none');
    };
});
