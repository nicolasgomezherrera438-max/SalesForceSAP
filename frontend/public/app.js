(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { token: localStorage.getItem('sfs_token') || '', user: null, page: 'dashboard', dashboard: null, customers: [], products: [], invoices: [], receivables: null, orders: [], routes: [], visits: [], sapStatus: null, outbox: [], orderLines: [] };
  const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));
  const date = value => { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(d); };
  const initials = value => String(value || 'SF').trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  // Construir la ubicación usando coordenadas o dirección del cliente
const mapQuery = item => {
  if (
    item?.latitude != null &&
    item?.longitude != null &&
    item.latitude !== '' &&
    item.longitude !== ''
  ) {
    return `${item.latitude},${item.longitude}`;
  }

  return [
    item?.address,
    item?.city,
    item?.customer_name || item?.name,
    item?.customer_code || item?.code
  ]
    .filter(value => String(value || '').trim())
    .join(', ');
};

// Buscar al cliente en Google Maps
const googleMapsSearchUrl = item =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(item) || 'Colombia')}`;

// Abrir navegación hasta un cliente
const googleMapsDirectionsUrl = item =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery(item) || 'Colombia')}&travelmode=driving`;
  const statusPill = status => { const s = String(status || 'pending').toLowerCase(); const map = { paid: ['Pagada', 'green'], partial: ['Parcial', 'orange'], pending: ['Pendiente', 'blue'], overdue: ['Vencida', 'red'], draft: ['Borrador', 'blue'], submitted: ['Enviada', 'orange'], accepted: ['Aceptada', 'green'], rejected: ['Rechazada', 'red'], cancelled: ['Cancelada', 'red'], planned: ['Planeada', 'blue'], in_progress: ['En curso', 'orange'], completed: ['Completada', 'green'], failed: ['Error', 'red'], succeeded: ['Exitosa', 'green'], processing: ['Procesando', 'orange'] }; const item = map[s] || [s.replaceAll('_', ' '), '']; return `<span class="pill ${item[1]}">${esc(item[0])}</span>`; };
  function toast(message, type = 'success') { const el = document.createElement('div'); el.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`; el.textContent = message; $('#toast-region').appendChild(el); setTimeout(() => el.remove(), 4000); }
  async function api(path, options = {}) { const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) }; let response; try { response = await fetch(`/api${path}`, { ...options, headers }); } catch (_error) { $('#api-status-dot')?.classList.remove('green'); if ($('#api-status-text')) $('#api-status-text').textContent = 'API sin conexion'; throw new Error('No se pudo conectar con la API. Comprueba que el backend este iniciado.'); } const payload = await response.json().catch(() => ({})); if (!response.ok) { if (response.status === 401 && state.token) logout(false); throw new Error(payload.message || payload.error || `Error ${response.status}`); } return payload; }
  function showLogin() { $('#login-view').hidden = false; $('#app-view').hidden = true; }
  function showApp() { $('#login-view').hidden = true; $('#app-view').hidden = false; const user = state.user || {}; $('#user-name').textContent = user.fullName || user.name || 'Usuario'; $('#user-role').textContent = ({ admin: 'Administrador', supervisor: 'Supervisor', seller: 'Vendedor' })[user.role] || user.role || 'Usuario'; $('#user-avatar').textContent = initials(user.fullName || user.name || user.email); $('#api-status-dot').classList.add('green'); $('#api-status-text').textContent = 'API conectada'; }
  function logout(notify = true) { state.token = ''; state.user = null; localStorage.removeItem('sfs_token'); localStorage.removeItem('sfs_user'); showLogin(); if (notify) toast('Sesion cerrada.', 'success'); }
  async function loadUser() { const stored = localStorage.getItem('sfs_user'); if (stored) { try { state.user = JSON.parse(stored); } catch (_e) {} } if (!state.token) return showLogin(); try { state.user = await api('/auth/me'); localStorage.setItem('sfs_user', JSON.stringify(state.user)); showApp(); await navigate(state.page || 'dashboard'); } catch (error) { if (state.token) { logout(false); showLogin(); } } }
  async function login(email, password) { const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); state.token = result.token; state.user = result.user; localStorage.setItem('sfs_token', state.token); localStorage.setItem('sfs_user', JSON.stringify(state.user)); showApp(); await navigate('dashboard'); }
  const pageNames = { dashboard: 'Inicio', customers: 'Clientes', products: 'Productos', orders: 'Pedidos y ventas', invoices: 'Facturas', receivables: 'Cartera', routes: 'Rutas', visits: 'Visitas', sap: 'Integracion SAP' };
  async function navigate(page) { state.page = page; $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page)); $('#breadcrumb-current').textContent = pageNames[page] || 'Inicio'; closeSidebar(); $('#page-content').innerHTML = '<div class="loading-panel">Cargando informacion...</div>'; try { if (page === 'dashboard') await loadDashboard(); if (page === 'customers') await loadCustomers(); if (page === 'products') await loadProducts(); if (page === 'orders') await loadOrders(); if (page === 'invoices') await loadInvoices(); if (page === 'receivables') await loadReceivables(); if (page === 'routes') await loadRoutes(); if (page === 'visits') await loadVisits(); if (page === 'sap') await loadSap(); renderPage(page); } catch (error) { $('#page-content').innerHTML = `<div class="empty-state"><div class="empty-state-icon">!</div><h3>No pudimos cargar esta seccion</h3><p>${esc(error.message)}</p><button class="button secondary" data-action="retry">Intentar de nuevo</button></div>`; } }
  async function loadDashboard() { state.dashboard = await api('/dashboard'); state.orders = await api('/orders'); state.customers = await api('/customers'); state.products = await api('/products'); }
  async function loadCustomers(search = '') { state.customers = await api(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`); }
  async function loadProducts(search = '') { state.products = await api(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`); }
  async function loadOrders() { state.orders = await api('/orders'); }
  async function loadInvoices() { state.invoices = await api('/invoices'); }
  async function loadReceivables() { state.receivables = await api('/receivables'); }
  async function loadRoutes() { state.routes = await api('/routes'); }
  async function loadVisits() { state.visits = await api('/visits'); }
  async function loadSap() { const results = await Promise.all([api('/sap/status'), state.user?.role === 'seller' ? Promise.resolve([]) : api('/sap/outbox')]); state.sapStatus = results[0]; state.outbox = results[1]; }
  function heading(title, description, actions = '') { return `<div class="page-heading"><div><div class="eyebrow-page">ALFA-APP / WORKSPACE</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`; }
  function stat(label, value, note, icon, color = '') { return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${color}">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${note}</div></article>`; }
  function table(headers, rows, emptyText = 'No hay registros para mostrar.') { return `<div class="panel table-panel"><div class="table-scroll"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td class="table-empty" colspan="${headers.length}">${emptyText}</td></tr>`}</tbody></table></div></div>`; }
  function renderPage(page) { const root = $('#page-content'); const renderers = { dashboard: renderDashboard, customers: renderCustomers, products: renderProducts, orders: renderOrders, invoices: renderInvoices, receivables: renderReceivables, routes: renderRoutes, visits: renderVisits, sap: renderSap }; root.innerHTML = (renderers[page] || renderDashboard)(); if (page === 'dashboard') drawChart(); }
  function renderDashboard() { const d = state.dashboard || {}; const daily = d.dailySales || []; const max = Math.max(1, ...daily.map(x => Number(x.total))); const productRows = (d.topProducts || []).slice(0, 5); const recentOrders = (state.orders || []).slice(0, 5); return `${heading('Resumen comercial','Indicadores y actividad de tu operacion comercial.', '<button class="button ghost" data-action="refresh">↻ Actualizar</button><button class="button primary" data-action="new-order">＋ Nuevo pedido</button>')}<div class="stats-grid">${stat('Ventas de hoy',money(d.salesToday),'Total de pedidos registrados hoy','↗','green')}${stat('Ventas del mes',money(d.salesThisMonth),'Acumulado del mes actual','▤','')}${stat('Clientes activos',Number(d.activeCustomers||0).toLocaleString('es-CO'),'Clientes disponibles para vender','♙','purple')}${stat('Visitas de hoy',Number(d.visitsToday||0).toLocaleString('es-CO'),`${Number(d.openOrders||0)} pedidos abiertos`,'⌖','orange')}</div><div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h3>Comportamiento de ventas</h3><p>Ultimos siete dias · valores en COP</p></div><span class="pill blue">Ultimos 7 dias</span></div><div class="chart-wrap"><canvas id="sales-chart" aria-label="Grafico de ventas diarias"></canvas></div><div class="legend-row"><span><i class="legend-mark"></i>Ventas registradas</span></div></section><section class="panel"><div class="panel-heading"><div><h3>Productos destacados</h3><p>Por valor vendido en los ultimos 30 dias</p></div></div><div class="product-ranking">${productRows.length ? productRows.map((p,i)=>`<div><div class="rank-item-top"><span>${esc(p.name)}</span><span>${money(p.total)}</span></div><div class="rank-track"><div class="rank-fill" style="width:${Math.max(4,Number(p.total)/Math.max(1,...productRows.map(x=>Number(x.total)))*100)}%"></div></div></div>`).join('') : '<div class="empty-state"><p>Aun no hay ventas de productos para graficar.</p></div>'}</div></section></div><div class="bottom-grid"><section class="panel"><div class="panel-heading"><div><h3>Pedidos recientes</h3><p>Ultimos documentos registrados en el sistema</p></div><button class="row-action" data-page="orders">Ver todos →</button></div><div class="activity-list">${recentOrders.length ? recentOrders.map(o=>`<div class="activity-row"><div class="activity-avatar">${initials(o.customer_name)}</div><div class="activity-main"><strong>${esc(o.customer_name || o.order_number)}</strong><small>${esc(o.order_number)} · ${date(o.created_at)}</small></div><div class="activity-value">${money(o.total)}</div>${statusPill(o.status)}</div>`).join('') : '<div class="empty-state"><p>Tus pedidos apareceran aqui cuando registres una venta.</p></div>'}</div></section><section class="panel"><div class="panel-heading"><div><h3>Acciones rapidas</h3><p>Accede a las tareas mas comunes</p></div></div><div class="quick-actions"><button class="quick-action" data-action="new-customer"><span class="qa-icon">＋</span><strong>Nuevo cliente</strong><small>Registrar cliente</small></button><button class="quick-action" data-action="new-order"><span class="qa-icon">▧</span><strong>Crear pedido</strong><small>Registrar una venta</small></button><button class="quick-action" data-page="routes"><span class="qa-icon">⌖</span><strong>Ver rutero</strong><small>Visitas del equipo</small></button><button class="quick-action" data-page="sap"><span class="qa-icon">⇄</span><strong>Estado SAP</strong><small>Ver sincronizacion</small></button></div></section></div>`; }
  function customerRow(c) { return `<tr><td><div class="customer-cell"><div class="customer-initials">${initials(c.name)}</div><div><div class="cell-primary">${esc(c.name)}</div><div class="cell-secondary">${esc(c.code)}${c.sap_id ? ` · SAP ${esc(c.sap_id)}` : ''}</div></div></div></td><td>${esc(c.city || '—')}</td><td>${esc(c.phone || '—')}</td><td>${money(c.balance)}</td><td>${c.source === 'sap' ? '<span class="pill green">SAP</span>' : '<span class="pill">Local</span>'}</td><td><button class="row-action" data-action="customer-detail" data-id="${c.id}">Ver detalle</button></td></tr>`; }
  function renderCustomers() { const rows = state.customers.map(customerRow); return `${heading('Clientes','Administra la cartera de clientes y consulta su informacion comercial.', '<button class="button primary" data-action="new-customer">＋ Nuevo cliente</button>')}<div class="toolbar"><div class="search-wrap"><span class="search-glyph">⌕</span><input class="search-input" id="customer-search" placeholder="Buscar por nombre, codigo o NIT..." value=""></div><span class="pill">${state.customers.length} clientes</span></div>${table(['Cliente','Ciudad','Telefono','Saldo','Origen','Acciones'],rows,'No se encontraron clientes. Crea uno o revisa la conexion con la API.')}`; }
  function renderProducts() { const products = state.products; return `${heading('Catalogo de productos','Consulta referencias, precios e inventario disponible.', '<button class="button ghost" data-action="refresh">↻ Actualizar</button>')}<div class="toolbar"><div class="search-wrap"><span class="search-glyph">⌕</span><input class="search-input" id="product-search" placeholder="Buscar producto o codigo..."></div><span class="pill">${products.length} referencias</span></div>${products.length ? `<div class="product-grid">${products.map((p,i)=>`<article class="product-card"><div class="product-art">${['▤','◈','▧','◇'][i%4]}</div><span class="pill blue">${esc(p.code)}</span><h3>${esc(p.name)}</h3><p>${esc(p.description || 'Producto del catalogo comercial')}</p><div class="product-meta"><div><div class="product-price">${money(p.price)}</div><div class="product-stock">Impuesto: ${Number(p.tax_rate||0)}%</div></div><span class="pill ${Number(p.stock)>0?'green':'red'}">Stock ${Number(p.stock||0).toLocaleString('es-CO')}</span></div><button class="button secondary full" data-action="order-product" data-id="${p.id}">Agregar a pedido</button></article>`).join('')}</div>` : '<div class="empty-state"><div class="empty-state-icon">▤</div><h3>Catalogo vacio</h3><p>No hay productos activos en la base de datos.</p></div>'}`; }
  function renderOrders() { const rows = state.orders.map(o=>`<tr><td><div class="cell-primary">${esc(o.order_number)}</div><div class="cell-secondary">${date(o.created_at)}</div></td><td>${esc(o.customer_name || '—')}</td><td>${esc(o.seller_name || state.user?.fullName || '—')}</td><td>${money(o.subtotal)}</td><td class="cell-primary">${money(o.total)}</td><td>${statusPill(o.status)}</td><td><button class="row-action" data-action="order-detail" data-id="${o.id}">Ver pedido</button></td></tr>`); return `${heading('Pedidos y ventas','Registra pedidos comerciales y consulta su estado de sincronizacion.', '<button class="button primary" data-action="new-order">＋ Crear pedido</button>')}<div class="stats-grid">${stat('Pedidos registrados',state.orders.length,'Total visible segun tu perfil','▧')}${stat('Valor acumulado',money(state.orders.reduce((s,o)=>s+Number(o.total||0),0)),'Suma de los pedidos visibles','↗','green')}${stat('Pendientes SAP',state.orders.filter(o=>!o.sap_id).length,'Esperando integracion real','⇄','orange')}${stat('Pedidos enviados',state.orders.filter(o=>['submitted','accepted'].includes(o.status)).length,'Estado comercial','✓','purple')}</div>${table(['Pedido / fecha','Cliente','Vendedor','Subtotal','Total','Estado','Acciones'],rows,'Aun no se han registrado pedidos.')}`; }
  function renderInvoices() { const rows = state.invoices.map(i=>`<tr><td><div class="cell-primary">${esc(i.invoice_number)}</div><div class="cell-secondary">Emision: ${date(i.issue_date)}</div></td><td>${esc(i.customer_name || '—')}<div class="cell-secondary">${esc(i.customer_code || '')}</div></td><td>${date(i.due_date)}</td><td>${money(i.total)}</td><td>${money(i.paid_amount)}</td><td class="cell-primary">${money(i.outstanding ?? Number(i.total)-Number(i.paid_amount))}</td><td>${statusPill(i.status)}</td></tr>`); return `${heading('Facturas','Consulta facturas existentes. La emision oficial debe gestionarse desde SAP o el sistema autorizado.','<button class="button ghost" data-action="refresh">↻ Actualizar</button>')}<div class="status-card"><div class="status-emblem">i</div><div><h3>Consulta de documentos</h3><p>Esta pantalla consulta las facturas guardadas en la base de datos. La emision fiscal y la numeracion oficial deben venir del sistema empresarial autorizado.</p></div></div>${table(['Factura / fecha','Cliente','Vencimiento','Valor total','Pagado','Saldo','Estado'],rows,'No hay facturas disponibles.')}`; }
  function renderReceivables() { const r=state.receivables||{}; const rows=(r.invoices||[]).map(i=>`<tr><td><div class="cell-primary">${esc(i.invoice_number)}</div><div class="cell-secondary">${esc(i.customer_code||'')}</div></td><td>${esc(i.customer_name)}</td><td>${date(i.due_date)}</td><td>${Number(i.days_overdue)>0?`<span class="pill red">${Number(i.days_overdue)} dias</span>`:'<span class="pill green">Al dia</span>'}</td><td>${money(i.total)}</td><td>${money(i.paid_amount)}</td><td class="cell-primary">${money(i.outstanding)}</td></tr>`); return `${heading('Cartera','Controla saldos pendientes y facturas vencidas.', '<button class="button ghost" data-action="refresh">↻ Actualizar</button>')}<div class="stats-grid">${stat('Cartera pendiente',money(r.totalOutstanding),'Saldo total por recaudar','$','orange')}${stat('Cartera vencida',money(r.overdueOutstanding),'Saldo con fecha de vencimiento superada','!','')}${stat('Facturas pendientes',(r.invoices||[]).length,'Documentos con saldo abierto','▥','purple')}${stat('Recaudo pendiente SAP','—','Pagos oficiales se registran en el sistema autorizado','⇄','green')}</div>${table(['Factura','Cliente','Vencimiento','Mora','Valor factura','Pagado','Saldo pendiente'],rows,'No hay cartera pendiente.')}`; }
  function renderRoutes() { const routes=state.routes||[]; return `${heading('Rutas comerciales','Consulta los ruteros asignados y abre la navegacion para cada cliente.', '<button class="button ghost" data-action="refresh">↻ Actualizar</button>')}${routes.length ? routes.map(route=>`<article class="route-card"><div class="route-card-head"><div><h3>${esc(route.route_name)}</h3><p>${date(route.route_date)} · ${esc(route.seller_name||'Vendedor asignado')} · ${(route.stops||[]).length} paradas</p></div>${statusPill(route.status)}</div><div class="route-stops">${(route.stops||[]).map((stop,i)=>`<div class="route-stop"><div class="stop-number">${i+1}</div><div class="stop-main"><strong>${esc(stop.customer_name)}</strong><small>${esc(stop.address||'Direccion no registrada')}${stop.city?` · ${esc(stop.city)}`:''}${stop.planned_time?` · ${esc(String(stop.planned_time).slice(0,5))}`:''}</small></div><div class="stop-actions">${statusPill(stop.status)}<button class="row-action" data-action="visit-customer" data-id="${stop.customer_id}" data-route="${route.id}" data-stop="${stop.id}">Registrar visita</button>${stop.latitude&&stop.longitude?`<a class="row-action" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}">Mapa</a>`:''}</div></div>`).join('')}</div></article>`).join('') : '<div class="empty-state"><div class="empty-state-icon">⌖</div><h3>No hay rutas asignadas</h3><p>Cuando el supervisor cree una ruta y la asigne a un vendedor, las paradas apareceran aqui.</p></div>'}`; }
function renderVisits() {
  const rows = state.visits.map(v => {
    const mapItem = {
      latitude: v.latitude ?? v.customer_latitude,
      longitude: v.longitude ?? v.customer_longitude,
      address: v.address,
      city: v.city,
      customer_name: v.customer_name,
      customer_code: v.customer_code
    };

    return `
      <tr>
        <td>
          <div class="cell-primary">${esc(v.customer_name)}</div>
          <div class="cell-secondary">${esc(v.customer_code || '')}</div>
          <div class="cell-secondary">
            ${esc([v.address, v.city].filter(Boolean).join(' · ') || 'Dirección no registrada')}
          </div>
        </td>
        <td>${date(v.check_in_at)}</td>
        <td>${esc(v.seller_name || '—')}</td>
        <td>${statusPill(v.result || 'pending')}</td>
        <td>${esc(v.notes || '—')}</td>
        <td>
          <a
            class="row-action"
            href="${googleMapsSearchUrl(mapItem)}"
            target="_blank"
            rel="noopener noreferrer">
            Ver en Google Maps ↗
          </a>
        </td>
      </tr>
    `;
  });

  return `${heading(
    'Visitas comerciales',
    'Registra visitas, captura tu ubicación y abre el destino en Google Maps.',
    '<button class="button primary" data-action="new-visit">＋ Registrar visita</button>'
  )}
  ${table(
    ['Cliente / dirección', 'Fecha', 'Vendedor', 'Resultado', 'Observaciones', 'Ubicación'],
    rows,
    'Todavía no hay visitas registradas.'
  )}`;
}
  function renderSap() { const s=state.sapStatus||{}; const enabled=Boolean(s.configured || s.enabled); const outbox=state.outbox||[]; const rows=outbox.map(j=>`<tr><td>#${j.id}</td><td>${esc(j.entity_type)}</td><td>${esc(j.operation)}</td><td>${statusPill(j.status)}</td><td>${Number(j.attempts||0)}</td><td>${esc(j.last_error||'—')}</td><td>${date(j.created_at)}</td></tr>`); return `${heading('Integracion SAP','Punto de extension para que el ingeniero configure la API de SAP.','<button class="button ghost" data-action="refresh">↻ Actualizar estado</button>')}<div class="status-card" style="background:${enabled?'#f7fbf9':'#fffaf1'};border-color:${enabled?'#d9f0e5':'#f3e4c7'}"><div class="status-emblem" style="background:${enabled?'#dff6ec':'#fff0d4'};color:${enabled?'#16875f':'#b8791d'}">${enabled?'✓':'⇄'}</div><div><h3>${enabled?'Configuracion SAP detectada':'Conector SAP pendiente de configuracion'}</h3><p>${esc(s.message || s.note || 'La API local funciona. El adaptador SAP requiere que el ingeniero confirme el producto SAP y complete la conexion segura en el servidor.')}</p></div>${statusPill(enabled?'succeeded':'pending')}</div><div class="sap-info-grid"><div class="info-tile"><small>Modo de integracion</small><strong>${esc(s.mode||'disabled')}</strong></div><div class="info-tile"><small>URL de SAP</small><strong>${esc(s.baseUrlConfigured?'Configurada':'Pendiente de URL')}</strong></div><div class="info-tile"><small>Cola de sincronizacion</small><strong>${outbox.length} operaciones visibles</strong></div></div><section class="panel"><div class="panel-heading"><div><h3>Configuracion para el ingeniero</h3><p>Los secretos deben configurarse en el servidor, nunca en el frontend.</p></div><span class="pill blue">Backend API</span></div><div class="code-box"># Archivo del servidor: .env
SAP_MODE=disabled
SAP_BASE_URL=
SAP_COMPANY_DB=
SAP_USERNAME=
SAP_PASSWORD=
SAP_AUTH_TYPE=service-layer
SAP_TIMEOUT_MS=15000

# Adaptador por completar:
src/integrations/sap/sap.adapter.js</div><div class="divider"></div><p class="muted-small">El pedido se guarda en PostgreSQL y se encola para sincronizacion. La accion de sincronizar respondera con un aviso hasta que el ingeniero implemente el adaptador especifico de SAP.</p><button class="button primary" data-action="sap-sync">Probar sincronizacion</button></section><section class="panel" style="margin-top:18px"><div class="panel-heading"><div><h3>Cola de sincronizacion</h3><p>Pedidos locales pendientes de enviar al sistema SAP.</p></div><span class="pill">${outbox.length} registros</span></div>${table(['ID','Entidad','Operacion','Estado','Intentos','Ultimo error','Creado'],rows,'No hay operaciones pendientes visibles. Solo administradores y supervisores pueden consultar esta cola.')}</section>`; }
  function drawChart() { const canvas=$('#sales-chart'); if(!canvas) return; const rect=canvas.getBoundingClientRect(); if (!rect.width) return; const ratio=window.devicePixelRatio||1; canvas.width=rect.width*ratio; canvas.height=rect.height*ratio; const ctx=canvas.getContext('2d'); ctx.scale(ratio,ratio); const w=rect.width,h=rect.height; const pad={l:8,r:12,t:12,b:30}; const data=(state.dashboard?.dailySales||[]); const values=data.map(d=>Number(d.total)||0); const max=Math.max(1,...values); ctx.clearRect(0,0,w,h); ctx.font='10px DM Sans, sans-serif'; ctx.textBaseline='middle'; for(let i=0;i<4;i++){const y=pad.t+(h-pad.t-pad.b)*i/3;ctx.strokeStyle='#edf1f7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();} if(!data.length){ctx.fillStyle='#8996aa';ctx.textAlign='center';ctx.fillText('Aun no hay datos para graficar',w/2,h/2);return;} const plotW=w-pad.l-pad.r,plotH=h-pad.t-pad.b,slot=plotW/data.length,barW=Math.min(25,slot*.46); data.forEach((item,i)=>{const value=Number(item.total)||0;const bh=value/max*(plotH-4);const x=pad.l+i*slot+(slot-barW)/2;const y=pad.t+plotH-bh;const grad=ctx.createLinearGradient(0,y,0,pad.t+plotH);grad.addColorStop(0,'#ce2e36');grad.addColorStop(1,'#2866d7');ctx.fillStyle=grad;roundRect(ctx,x,y,barW,Math.max(3,bh),5);const label=String(item.date||'').slice(5).replace('-','/');ctx.fillStyle='#91a0b5';ctx.textAlign='center';ctx.fillText(label,x+barW/2,h-12);}); }
  function roundRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();ctx.fill();}
  function openModal(title, subtitle, body, onSubmit, submitText='Guardar') { const root=$('#modal-root'); root.innerHTML=`<div class="modal-backdrop" data-action="backdrop-close"><section class="modal-card" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="modal-close" type="button" data-action="close-modal" aria-label="Cerrar">×</button></div><form id="modal-form"><div class="modal-body">${body}</div><div class="modal-footer"><button type="button" class="button ghost" data-action="close-modal">Cancelar</button><button type="submit" class="button primary" id="modal-submit">${submitText}</button></div></form></section></div>`; $('#modal-form').addEventListener('submit',async e=>{e.preventDefault();const btn=$('#modal-submit');btn.disabled=true;btn.textContent='Guardando...';try{await onSubmit(new FormData(e.currentTarget),e.currentTarget);root.innerHTML='';}catch(error){toast(error.message,'error');btn.disabled=false;btn.textContent=submitText;}}); }
  const field=(label,name,placeholder='',type='text',opts={})=>`<div class="form-field ${opts.full?'full-span':''}"><label for="f-${name}">${label}</label>${opts.select?`<select id="f-${name}" name="${name}" ${opts.required?'required':''}>${opts.select}</select>`:type==='textarea'?`<textarea id="f-${name}" name="${name}" placeholder="${placeholder}" ${opts.required?'required':''}></textarea>`:`<input id="f-${name}" name="${name}" type="${type}" placeholder="${placeholder}" ${opts.required?'required':''} ${opts.min!==undefined?`min="${opts.min}"`:''} ${opts.step?`step="${opts.step}"`:''} ${opts.value!==undefined?`value="${opts.value}"`:''}>`}</div>`;
  function newCustomerModal() { const body=`<div class="form-grid">${field('Codigo de cliente *','code','CLI-0001','text',{required:true})}${field('Nombre / razon social *','name','Nombre del cliente','text',{required:true})}${field('NIT / identificacion','taxId','900000000-1')}${field('Tipo de cliente','customerType','Distribuidor')}${field('Ciudad','city','Bogota')}${field('Telefono','phone','3000000000','tel')}${field('Correo','email','contacto@empresa.com','email')}${field('Direccion','address','Direccion del cliente','text',{full:true})}${field('Limite de credito','creditLimit','0','number',{min:0,step:'1000'})}</div><p class="muted-small">El cliente se guardara en la base local. La referencia SAP se puede mapear despues en el adaptador.</p>`; openModal('Crear cliente','Registra los datos comerciales basicos.',body,async form=>{const payload=Object.fromEntries(form.entries());payload.creditLimit=Number(payload.creditLimit||0);await api('/customers',{method:'POST',body:JSON.stringify(payload)});toast('Cliente creado correctamente.');await navigate('customers');}); }
  function newOrderModal(prefillProduct) { if(!state.customers.length || !state.products.length){toast('Necesitas al menos un cliente y un producto para crear el pedido.','error');return;} state.orderLines=[{productId:prefillProduct?String(prefillProduct):String(state.products[0].id),quantity:1}]; const customerOptions=state.customers.map(c=>`<option value="${c.id}">${esc(c.code)} · ${esc(c.name)}</option>`).join(''); const body=`<div class="form-field"><label for="f-customerId">Cliente *</label><select id="f-customerId" name="customerId" required>${customerOptions}</select></div><div class="panel-heading" style="margin:18px 0 10px"><div><h3>Detalle del pedido</h3><p>Los precios e impuestos se calculan en el servidor.</p></div><button type="button" class="button secondary" data-action="add-order-line">＋ Producto</button></div><div id="order-lines"></div><div class="order-total"><span>Total estimado del pedido</span><strong id="order-total">${money(0)}</strong></div>${field('Observaciones','notes','Fecha de entrega, condiciones o comentarios','textarea',{full:true})}`; openModal('Crear pedido','Registra una nueva venta para enviarla a la cola de integracion SAP.',body,async(form)=>{const lines=$$('.order-line', $('#order-lines')).map(row=>({productId:Number($('select',row).value),quantity:Number($('input',row).value)})).filter(x=>x.productId&&x.quantity>0); if(!lines.length)throw new Error('Agrega por lo menos un producto con cantidad valida.'); const payload={customerId:Number(form.get('customerId')),items:lines,notes:form.get('notes')||''}; const order=await api('/orders',{method:'POST',body:JSON.stringify(payload)});toast(`Pedido ${order.order_number} guardado. Sincronizacion SAP pendiente.`);await navigate('orders');},'Guardar pedido'); renderOrderLines(); }
  function renderOrderLines(){const root=$('#order-lines');if(!root)return;root.innerHTML=state.orderLines.map((line,i)=>`<div class="order-line" data-line="${i}"><select aria-label="Producto">${state.products.map(p=>`<option value="${p.id}" ${String(p.id)===String(line.productId)?'selected':''}>${esc(p.code)} · ${esc(p.name)} (${money(p.price)})</option>`).join('')}</select><input aria-label="Cantidad" type="number" min="0.001" step="1" value="${line.quantity}" required><button type="button" data-action="remove-order-line" data-index="${i}" aria-label="Quitar producto">×</button></div>`).join(''); const update=()=>{let total=0;$$('.order-line',root).forEach(row=>{const p=state.products.find(p=>String(p.id)===$('select',row).value);const q=Number($('input',row).value)||0;if(p)total+=q*Number(p.price)*(1+Number(p.tax_rate||0)/100);});$('#order-total').textContent=money(total);}; root.onchange=update;root.oninput=update;update(); }
  async function customerDetail(id){const c=await api(`/customers/${id}`);const body=`<div class="form-grid"><div class="info-tile"><small>Codigo</small><strong>${esc(c.code)}</strong></div><div class="info-tile"><small>Saldo registrado</small><strong>${money(c.balance)}</strong></div><div class="info-tile"><small>Ciudad</small><strong>${esc(c.city||'—')}</strong></div><div class="info-tile"><small>Telefono</small><strong>${esc(c.phone||'—')}</strong></div><div class="form-field full-span"><label>Direccion</label><div>${esc(c.address||'Sin direccion registrada')}</div></div><div class="form-field full-span"><label>Facturas recientes</label><div>${(c.invoices||[]).length?(c.invoices||[]).map(i=>`<div class="activity-row"><div class="activity-main"><strong>${esc(i.invoice_number)}</strong><small>${date(i.issue_date)}</small></div><div class="activity-value">${money(i.total)}</div>${statusPill(i.status)}</div>`).join(''):'Sin facturas'}</div></div><div class="form-field full-span"><label>Pedidos recientes</label><div>${(c.orders||[]).length?(c.orders||[]).map(o=>`<div class="activity-row"><div class="activity-main"><strong>${esc(o.order_number)}</strong><small>${date(o.created_at)}</small></div><div class="activity-value">${money(o.total)}</div>${statusPill(o.status)}</div>`).join(''):'Sin pedidos'}</div></div></div>`;openModal(esc(c.name),'Detalle del cliente',body,async()=>{},'Cerrar');$('#modal-form').addEventListener('submit',e=>{e.preventDefault();$('#modal-root').innerHTML='';});$('#modal-submit').type='button';$('#modal-submit').addEventListener('click',()=>$('#modal-root').innerHTML='');}
  async function orderDetail(id){const o=await api(`/orders/${id}`);const body=`<div class="form-grid"><div class="info-tile"><small>Numero de pedido</small><strong>${esc(o.order_number)}</strong></div><div class="info-tile"><small>Estado</small><strong>${esc(o.status)}</strong></div><div class="info-tile"><small>Cliente</small><strong>${esc(o.customer_name)}</strong></div><div class="info-tile"><small>Total</small><strong>${money(o.total)}</strong></div><div class="form-field full-span"><label>Productos</label>${(o.items||[]).map(i=>`<div class="activity-row"><div class="activity-main"><strong>${esc(i.product_name)}</strong><small>${Number(i.quantity)} × ${money(i.unit_price)}</small></div><div class="activity-value">${money(i.line_total)}</div></div>`).join('')}</div><div class="form-field full-span"><label>Observaciones</label><p>${esc(o.notes||'Sin observaciones')}</p></div></div>`;openModal('Detalle de pedido','Resumen de la venta registrada.',body,async()=>{},'Cerrar');$('#modal-submit').type='button';$('#modal-submit').addEventListener('click',()=>$('#modal-root').innerHTML='');}

function newVisitModal(customerId, routeId, stopId) {
  if (!state.customers.length) {
    toast('No hay clientes disponibles.', 'error');
    return;
  }

  const options = state.customers.map(c =>
    `<option value="${c.id}" ${
      String(c.id) === String(customerId) ? 'selected' : ''
    }>${esc(c.code)} · ${esc(c.name)}</option>`
  ).join('');

  const body = `
    <div class="form-grid">

      <div class="form-field full-span">
        <label for="f-customerId">Cliente *</label>
        <select id="f-customerId" name="customerId" required>
          ${options}
        </select>
      </div>

      ${field(
        'Resultado',
        'result',
        '',
        'text',
        {
          select: `
            <option value="pending">Pendiente</option>
            <option value="sale">Venta realizada</option>
            <option value="no_sale">Sin venta</option>
            <option value="reschedule">Reprogramar</option>
            <option value="collection">Gestión de cartera</option>
          `
        }
      )}

      ${field('Latitud', 'latitude', '', 'number', {step: 'any'})}

      ${field('Longitud', 'longitude', '', 'number', {step: 'any'})}

      <div class="form-field full-span">
        <label>Ubicación del cliente</label>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button
            type="button"
            class="button secondary"
            id="visit-open-maps">
            Abrir Google Maps
          </button>

          <button
            type="button"
            class="button secondary"
            id="visit-capture-gps">
            Capturar mi GPS
          </button>
        </div>

        <small id="visit-gps-status">
          Puedes abrir la dirección del cliente o registrar tu ubicación actual.
        </small>
      </div>

      ${field(
        'Observaciones',
        'notes',
        'Resultado y compromisos de la visita',
        'textarea',
        {full: true}
      )}

    </div>
  `;

  openModal(
    'Registrar visita',
    'Guarda el resultado comercial y la ubicación de la visita.',
    body,
    async form => {
      const payload = {
        customerId: Number(form.get('customerId')),
        result: form.get('result'),
        notes: form.get('notes') || '',
        latitude: form.get('latitude')
          ? Number(form.get('latitude'))
          : null,
        longitude: form.get('longitude')
          ? Number(form.get('longitude'))
          : null,
        routeId: routeId ? Number(routeId) : null,
        routeStopId: stopId ? Number(stopId) : null
      };

      await api('/visits', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      toast('Visita registrada correctamente.');
      await navigate('visits');
    }
  );

  // Obtener los elementos del formulario recién abierto.
  const customerSelect = document.getElementById('f-customerId');
  const latitudeInput = document.getElementById('f-latitude');
  const longitudeInput = document.getElementById('f-longitude');
  const mapsButton = document.getElementById('visit-open-maps');
  const gpsButton = document.getElementById('visit-capture-gps');
  const gpsStatus = document.getElementById('visit-gps-status');

  // Construir la dirección del cliente seleccionado.
  function getSelectedCustomerQuery() {
    const customer = state.customers.find(
      c => String(c.id) === String(customerSelect.value)
    );

    if (!customer) return '';

    return [
      customer.name,
      customer.address || customer.address_line || customer.street,
      customer.city || customer.city_name,
      customer.code,
      'Colombia'
    ]
      .filter(value => String(value || '').trim())
      .join(', ');
  }

  // Abrir la ubicación del cliente en Google Maps.
  mapsButton.addEventListener('click', () => {
    const query = getSelectedCustomerQuery();

    if (!query) {
      toast('No se encontró la dirección del cliente.', 'error');
      return;
    }

    const url =
      'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(query);

    window.open(url, '_blank', 'noopener,noreferrer');
  });

  // Capturar la ubicación actual del vendedor.
  gpsButton.addEventListener('click', () => {
    if (!navigator.geolocation) {
      gpsStatus.textContent =
        'Este navegador no permite capturar la ubicación GPS.';
      return;
    }

    gpsStatus.textContent = 'Obteniendo ubicación...';
    gpsButton.disabled = true;

    navigator.geolocation.getCurrentPosition(
      position => {
        latitudeInput.value = position.coords.latitude;
        longitudeInput.value = position.coords.longitude;

        gpsStatus.textContent =
          'Ubicación capturada correctamente. Se guardará al registrar la visita.';

        gpsButton.disabled = false;
      },
      error => {
        const messages = {
          1: 'Debes permitir el acceso a la ubicación en el navegador.',
          2: 'No fue posible determinar tu ubicación.',
          3: 'La solicitud tardó demasiado. Intenta nuevamente.'
        };

        gpsStatus.textContent =
          messages[error.code] || 'No se pudo obtener la ubicación.';

        gpsButton.disabled = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}
  function closeSidebar(){ $('#sidebar').classList.remove('open');$('#sidebar-scrim').classList.remove('open'); }
  document.addEventListener('click',async event=>{const nav=event.target.closest('[data-page]');if(nav){event.preventDefault();await navigate(nav.dataset.page);return;}const el=event.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;try{if(action==='close-modal'||(action==='backdrop-close'&&event.target===el))$('#modal-root').innerHTML='';else if(action==='retry'||action==='refresh'){await navigate(state.page);}else if(action==='new-customer')newCustomerModal();else if(action==='new-order')newOrderModal();else if(action==='order-product')newOrderModal(el.dataset.id);else if(action==='add-order-line'){state.orderLines.push({productId:String(state.products[0]?.id||''),quantity:1});renderOrderLines();}else if(action==='remove-order-line'){state.orderLines.splice(Number(el.dataset.index),1);if(!state.orderLines.length)state.orderLines.push({productId:String(state.products[0]?.id||''),quantity:1});renderOrderLines();}else if(action==='customer-detail')await customerDetail(el.dataset.id);else if(action==='order-detail')await orderDetail(el.dataset.id);else if(action==='visit-customer')newVisitModal(el.dataset.id,el.dataset.route,el.dataset.stop);else if(action==='new-visit')newVisitModal();else if(action==='sap-sync'){try{await api('/sap/sync',{method:'POST',body:JSON.stringify({})});toast('Solicitud enviada.','success');}catch(error){toast(error.message,'error');}}}catch(error){toast(error.message,'error');}});
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const error=$('#login-error');error.hidden=true;const btn=$('button[type="submit"]',e.currentTarget);btn.disabled=true;btn.textContent='Ingresando...';try{await login($('#login-email').value.trim(),$('#login-password').value);}catch(err){error.textContent=err.message;error.hidden=false;}finally{btn.disabled=false;btn.innerHTML='Ingresar <span aria-hidden="true">→</span>';}});
  $('#logout-button').addEventListener('click',()=>logout());$('#menu-toggle').addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#sidebar-scrim').classList.add('open');});$('#sidebar-close').addEventListener('click',closeSidebar);$('#sidebar-scrim').addEventListener('click',closeSidebar);
  let customerSearchTimer,productSearchTimer;document.addEventListener('input',e=>{if(e.target.id==='customer-search'){clearTimeout(customerSearchTimer);customerSearchTimer=setTimeout(async()=>{try{await loadCustomers(e.target.value);const tbody=$('tbody');if(tbody)tbody.innerHTML=state.customers.length?state.customers.map(customerRow).join(''):`<tr><td class="table-empty" colspan="6">No se encontraron clientes.</td></tr>`;}catch(err){toast(err.message,'error');}},250);}if(e.target.id==='product-search'){clearTimeout(productSearchTimer);productSearchTimer=setTimeout(async()=>{try{await loadProducts(e.target.value);renderPage('products');const input=$('#product-search');if(input){input.value=e.target.value;input.focus();input.setSelectionRange(input.value.length,input.value.length);}}catch(err){toast(err.message,'error');}},250);}});
  window.addEventListener('resize',()=>{if(state.page==='dashboard')drawChart();});
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  if(state.token)loadUser();else showLogin();
})();
