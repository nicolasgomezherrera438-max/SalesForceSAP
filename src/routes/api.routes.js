const express = require('express');
const db = require('../db');
const { authenticate, allowRoles } = require('../middleware/auth');
const { recordAudit } = require('../services/audit');
const sapAdapter = require('../integrations/sap/sap.adapter');

const router = express.Router();
router.use(authenticate);

function sellerScope(user, sqlAlias, params) {
  if (user.role !== 'seller') return { clause: '', params };
  params.push(user.id);
  return { clause: ` AND ${sqlAlias}=$${params.length}`, params };
}

router.get('/dashboard', async (req, res, next) => {
  try {
    const user = req.user;
    const orderScope = user.role === 'seller' ? ' AND seller_id=$1' : '';
    const visitScope = user.role === 'seller' ? ' AND seller_id=$1' : '';
    const args = user.role === 'seller' ? [user.id] : [];
    const [todaySales, monthSales, visits, orders, customers, topProducts, dailySales] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(total),0) AS total, COUNT(*)::int AS count FROM sales_orders WHERE created_at::date=CURRENT_DATE AND status <> 'cancelled'${orderScope}`, args),
      db.query(`SELECT COALESCE(SUM(total),0) AS total FROM sales_orders WHERE date_trunc('month', created_at)=date_trunc('month', CURRENT_DATE) AND status <> 'cancelled'${orderScope}`, args),
      db.query(`SELECT COUNT(*)::int AS count FROM visits WHERE check_in_at::date=CURRENT_DATE${visitScope}`, args),
      db.query(`SELECT COUNT(*)::int AS count FROM sales_orders WHERE status IN ('draft','submitted')${orderScope}`, args),
      db.query(`SELECT COUNT(*)::int AS count FROM customers c WHERE c.active=TRUE${user.role === 'seller' ? ' AND c.assigned_seller_id=$1' : ''}`, args),
      db.query(`SELECT i.product_name AS name, SUM(i.quantity)::numeric AS quantity, SUM(i.line_total)::numeric AS total FROM sales_order_items i JOIN sales_orders o ON o.id=i.order_id WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'${user.role === 'seller' ? ' AND o.seller_id=$1' : ''} GROUP BY i.product_name ORDER BY total DESC LIMIT 5`, args),
      db.query(`SELECT to_char(day::date,'YYYY-MM-DD') AS date, COALESCE(SUM(o.total),0)::numeric AS total FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') day LEFT JOIN sales_orders o ON o.created_at::date=day::date AND o.status <> 'cancelled'${user.role === 'seller' ? ' AND o.seller_id=$1' : ''} GROUP BY day ORDER BY day`, args)
    ]);
    res.json({
      salesToday: Number(todaySales.rows[0].total), ordersToday: todaySales.rows[0].count,
      salesThisMonth: Number(monthSales.rows[0].total), visitsToday: visits.rows[0].count,
      openOrders: orders.rows[0].count, activeCustomers: customers.rows[0].count,
      topProducts: topProducts.rows.map(x => ({ name: x.name, quantity: Number(x.quantity), total: Number(x.total) })),
      dailySales: dailySales.rows.map(x => ({ date: x.date, total: Number(x.total) }))
    });
  } catch (error) { next(error); }
});

router.get('/customers', async (req, res, next) => {
  try {
    const params = [];
    let where = 'WHERE c.active=TRUE';
    if (req.user.role === 'seller') { params.push(req.user.id); where += ` AND c.assigned_seller_id=$${params.length}`; }
    const search = String(req.query.search || '').trim();
    if (search) { params.push(`%${search}%`); where += ` AND (c.name ILIKE $${params.length} OR c.code ILIKE $${params.length} OR COALESCE(c.tax_id,'') ILIKE $${params.length})`; }
    const result = await db.query(`SELECT c.*, u.full_name AS seller_name FROM customers c LEFT JOIN users u ON u.id=c.assigned_seller_id ${where} ORDER BY c.name LIMIT 500`, params);
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.get('/customers/:id', async (req, res, next) => {
  try {
    const params = [req.params.id];
    let scope = '';
    if (req.user.role === 'seller') { params.push(req.user.id); scope = ' AND assigned_seller_id=$2'; }
    const result = await db.query(`SELECT * FROM customers WHERE id=$1${scope}`, params);
    if (!result.rows[0]) return res.status(404).json({ error: 'Customer not found.' });
    const [invoices, orders] = await Promise.all([
      db.query('SELECT id, invoice_number, issue_date, due_date, total, paid_amount, status FROM invoices WHERE customer_id=$1 ORDER BY issue_date DESC LIMIT 20', [req.params.id]),
      db.query('SELECT id, order_number, status, total, created_at FROM sales_orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 20', [req.params.id])
    ]);
    res.json({ ...result.rows[0], invoices: invoices.rows, orders: orders.rows });
  } catch (error) { next(error); }
});

router.post('/customers', async (req, res, next) => {
  try {
    const { code, name, taxId, customerType, address, city, phone, email, creditLimit } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name are required.' });
    const sellerId = req.user.role === 'seller' ? req.user.id : (req.body.assignedSellerId || null);
    const result = await db.query(`INSERT INTO customers (code,name,tax_id,customer_type,address,city,phone,email,assigned_seller_id,credit_limit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [code, name, taxId || null, customerType || null, address || null, city || null, phone || null, email || null, sellerId, Number(creditLimit || 0)]);
    await recordAudit(req.user.id, 'create', 'customer', result.rows[0].id, { code });
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

router.put('/customers/:id', async (req, res, next) => {
  try {
    const existing = await db.query('SELECT * FROM customers WHERE id=$1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Customer not found.' });
    if (req.user.role === 'seller' && Number(existing.rows[0].assigned_seller_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Customer is assigned to another seller.' });
    const b = req.body;
    const result = await db.query(`UPDATE customers SET name=COALESCE($2,name), tax_id=COALESCE($3,tax_id), customer_type=COALESCE($4,customer_type), address=COALESCE($5,address), city=COALESCE($6,city), phone=COALESCE($7,phone), email=COALESCE($8,email), updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id,b.name ?? null,b.taxId ?? null,b.customerType ?? null,b.address ?? null,b.city ?? null,b.phone ?? null,b.email ?? null]);
    await recordAudit(req.user.id, 'update', 'customer', result.rows[0].id, {});
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

router.get('/products', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const result = search
      ? await db.query("SELECT * FROM products WHERE active=TRUE AND (name ILIKE $1 OR code ILIKE $1) ORDER BY name LIMIT 500", [`%${search}%`])
      : await db.query('SELECT * FROM products WHERE active=TRUE ORDER BY name LIMIT 500');
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post('/products', allowRoles('admin','supervisor'), async (req, res, next) => {
  try {
    const { code, name, description, unit, price, taxRate, stock } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name are required.' });
    const result = await db.query('INSERT INTO products (code,name,description,unit,price,tax_rate,stock) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [code,name,description || null,unit || 'UND',Number(price || 0),Number(taxRate || 0),Number(stock || 0)]);
    await recordAudit(req.user.id, 'create', 'product', result.rows[0].id, { code });
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

router.get('/invoices', async (req, res, next) => {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (req.user.role === 'seller') { params.push(req.user.id); where += ` AND c.assigned_seller_id=$${params.length}`; }
    if (req.query.status) { params.push(String(req.query.status)); where += ` AND i.status=$${params.length}`; }
    const result = await db.query(`SELECT i.*, c.code AS customer_code, c.name AS customer_name, GREATEST(i.total-i.paid_amount,0)::numeric AS outstanding FROM invoices i JOIN customers c ON c.id=i.customer_id ${where} ORDER BY i.issue_date DESC LIMIT 1000`, params);
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.get('/receivables', async (req, res, next) => {
  try {
    const params = [];
    let scope = '';
    if (req.user.role === 'seller') { params.push(req.user.id); scope = ` AND c.assigned_seller_id=$${params.length}`; }
    const result = await db.query(`SELECT i.id, i.invoice_number, i.issue_date, i.due_date, i.status, i.total, i.paid_amount, GREATEST(i.total-i.paid_amount,0)::numeric AS outstanding, CASE WHEN i.due_date<CURRENT_DATE AND i.total>i.paid_amount THEN CURRENT_DATE-i.due_date ELSE 0 END AS days_overdue, c.code AS customer_code, c.name AS customer_name FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.status NOT IN ('paid','cancelled') AND i.total>i.paid_amount${scope} ORDER BY i.due_date NULLS LAST LIMIT 1000`, params);
    const total = result.rows.reduce((sum, row) => sum + Number(row.outstanding), 0);
    const overdue = result.rows.filter(row => Number(row.days_overdue) > 0).reduce((sum, row) => sum + Number(row.outstanding), 0);
    res.json({ totalOutstanding: total, overdueOutstanding: overdue, invoices: result.rows });
  } catch (error) { next(error); }
});

router.get('/orders', async (req, res, next) => {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (req.user.role === 'seller') { params.push(req.user.id); where += ` AND o.seller_id=$${params.length}`; }
    const result = await db.query(`SELECT o.*, c.code AS customer_code, c.name AS customer_name, u.full_name AS seller_name FROM sales_orders o JOIN customers c ON c.id=o.customer_id JOIN users u ON u.id=o.seller_id ${where} ORDER BY o.created_at DESC LIMIT 1000`, params);
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const params = [req.params.id];
    let scope = '';
    if (req.user.role === 'seller') { params.push(req.user.id); scope = ' AND o.seller_id=$2'; }
    const order = await db.query(`SELECT o.*, c.name AS customer_name, c.code AS customer_code FROM sales_orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=$1${scope}`, params);
    if (!order.rows[0]) return res.status(404).json({ error: 'Order not found.' });
    const items = await db.query('SELECT * FROM sales_order_items WHERE order_id=$1 ORDER BY id', [req.params.id]);
    res.json({ ...order.rows[0], items: items.rows });
  } catch (error) { next(error); }
});

router.post('/orders', async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { customerId, items, notes } = req.body;
    if (!customerId || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'customerId and a non-empty items array are required.' });
    await client.query('BEGIN');
    const customerParams = req.user.role === 'seller' ? [customerId, req.user.id] : [customerId];
    const customerQuery = req.user.role === 'seller'
      ? 'SELECT id, name FROM customers WHERE id=$1 AND assigned_seller_id=$2 AND active=TRUE FOR SHARE'
      : 'SELECT id, name FROM customers WHERE id=$1 AND active=TRUE FOR SHARE';
    const customer = await client.query(customerQuery, customerParams);
    if (!customer.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Customer does not exist, is inactive, or is not assigned to you.' }); }

    let subtotal = 0;
    let taxTotal = 0;
    const normalizedItems = [];
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw Object.assign(new Error('Each item quantity must be greater than zero.'), { status: 400 });
      const productResult = await client.query('SELECT id, code, name, price, tax_rate, active FROM products WHERE id=$1 FOR SHARE', [item.productId]);
      const product = productResult.rows[0];
      if (!product || !product.active) throw Object.assign(new Error(`Product ${item.productId} does not exist or is inactive.`), { status: 400 });
      const unitPrice = Number(product.price);
      const taxRate = Number(product.tax_rate);
      const lineSubtotal = Math.round(quantity * unitPrice * 100) / 100;
      const lineTax = Math.round(lineSubtotal * taxRate) / 100;
      const lineTotal = Math.round((lineSubtotal + lineTax) * 100) / 100;
      subtotal += lineSubtotal;
      taxTotal += lineTax;
      normalizedItems.push({ productId: product.id, productCode: product.code, productName: product.name, quantity, unitPrice, taxRate, lineSubtotal, lineTax, lineTotal });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    taxTotal = Math.round(taxTotal * 100) / 100;
    const total = Math.round((subtotal + taxTotal) * 100) / 100;
    const orderNumber = `SO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    const orderResult = await client.query(`INSERT INTO sales_orders (order_number,customer_id,seller_id,status,subtotal,tax_total,total,notes) VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7) RETURNING *`, [orderNumber, customerId, req.user.id, subtotal, taxTotal, total, notes || null]);
    const order = orderResult.rows[0];
    for (const item of normalizedItems) {
      await client.query(`INSERT INTO sales_order_items (order_id,product_id,product_code,product_name,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [order.id,item.productId,item.productCode,item.productName,item.quantity,item.unitPrice,item.taxRate,item.lineSubtotal,item.lineTax,item.lineTotal]);
    }
    const payload = { orderNumber, customerId: Number(customerId), customerName: customer.rows[0].name, sellerId: Number(req.user.id), notes: notes || null, subtotal, taxTotal, total, items: normalizedItems };
    await client.query(`INSERT INTO sap_sync_jobs (entity_type,entity_id,operation,payload) VALUES ('sales_order',$1,'create',$2)`, [order.id, JSON.stringify(payload)]);
    await client.query('COMMIT');
    await recordAudit(req.user.id, 'create', 'sales_order', order.id, { orderNumber, total });
    res.status(201).json({ ...order, customer_name: customer.rows[0].name, items: normalizedItems, sapSyncStatus: 'pending_configuration' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_rollbackError) {}
    next(error);
  } finally { client.release(); }
});

router.get('/routes', async (req, res, next) => {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (req.user.role === 'seller') { params.push(req.user.id); where += ` AND r.assigned_seller_id=$${params.length}`; }
    if (req.query.date) { params.push(req.query.date); where += ` AND r.route_date=$${params.length}`; }
    const result = await db.query(`SELECT r.*, u.full_name AS seller_name FROM routes r JOIN users u ON u.id=r.assigned_seller_id ${where} ORDER BY r.route_date DESC,r.id DESC LIMIT 300`, params);
    const routes = [];
    for (const route of result.rows) {
      const stops = await db.query(`SELECT rs.*, c.code AS customer_code, c.name AS customer_name, c.address, c.city, c.latitude, c.longitude FROM route_stops rs JOIN customers c ON c.id=rs.customer_id WHERE rs.route_id=$1 ORDER BY rs.stop_order`, [route.id]);
      routes.push({ ...route, stops: stops.rows });
    }
    res.json(routes);
  } catch (error) { next(error); }
});

router.post('/routes', allowRoles('admin','supervisor'), async (req, res, next) => {
  try {
    const { routeName, assignedSellerId, routeDate, notes, customerIds } = req.body;
    if (!routeName || !assignedSellerId || !Array.isArray(customerIds) || !customerIds.length) return res.status(400).json({ error: 'routeName, assignedSellerId and customerIds are required.' });
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const routeResult = await client.query('INSERT INTO routes (route_name,assigned_seller_id,route_date,notes) VALUES ($1,$2,COALESCE($3::date,CURRENT_DATE),$4) RETURNING *', [routeName,assignedSellerId,routeDate || null,notes || null]);
      for (let i=0; i<customerIds.length; i++) {
        await client.query('INSERT INTO route_stops (route_id,customer_id,stop_order) VALUES ($1,$2,$3)', [routeResult.rows[0].id,customerIds[i],i+1]);
      }
      await client.query('COMMIT');
      await recordAudit(req.user.id, 'create', 'route', routeResult.rows[0].id, { stops: customerIds.length });
      res.status(201).json(routeResult.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } catch (error) { next(error); }
});

router.post('/visits', async (req, res, next) => {
  try {
    const { customerId, routeId, routeStopId, latitude, longitude, result, notes, evidenceUrl } = req.body;
    if (!customerId) return res.status(400).json({ error: 'customerId is required.' });
    const params = req.user.role === 'seller' ? [customerId,req.user.id] : [customerId];
    const customerQuery = req.user.role === 'seller' ? 'SELECT id FROM customers WHERE id=$1 AND assigned_seller_id=$2' : 'SELECT id FROM customers WHERE id=$1';
    if (!(await db.query(customerQuery, params)).rows[0]) return res.status(400).json({ error: 'Customer not found or not assigned to you.' });
    const visit = await db.query('INSERT INTO visits (customer_id,seller_id,route_id,route_stop_id,latitude,longitude,result,notes,evidence_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [customerId,req.user.id,routeId || null,routeStopId || null,latitude ?? null,longitude ?? null,result || 'pending',notes || null,evidenceUrl || null]);
    if (routeStopId) await db.query("UPDATE route_stops SET status='completed' WHERE id=$1", [routeStopId]);
    await recordAudit(req.user.id, 'create', 'visit', visit.rows[0].id, { customerId });
    res.status(201).json(visit.rows[0]);
  } catch (error) { next(error); }
});

router.get('/visits', async (req, res, next) => {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (req.user.role === 'seller') { params.push(req.user.id); where += ` AND v.seller_id=$${params.length}`; }
    const result = await db.query(`SELECT v.*, c.code AS customer_code, c.name AS customer_name, u.full_name AS seller_name FROM visits v JOIN customers c ON c.id=v.customer_id JOIN users u ON u.id=v.seller_id ${where} ORDER BY v.check_in_at DESC LIMIT 1000`, params);
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post('/payments', allowRoles('admin','supervisor'), async (req, res, next) => {
  const client = await db.getClient();
  try {
    const { invoiceId, amount, paymentDate, paymentMethod, reference, notes } = req.body;
    const paymentAmount = Number(amount);
    if (!invoiceId || !Number.isFinite(paymentAmount) || paymentAmount <= 0) return res.status(400).json({ error: 'invoiceId and a positive amount are required.' });
    await client.query('BEGIN');
    const invoiceResult = await client.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [invoiceId]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Invoice not found.' }); }
    const outstanding = Number(invoice.total) - Number(invoice.paid_amount);
    if (paymentAmount > outstanding + 0.001) throw Object.assign(new Error('Payment exceeds invoice outstanding balance.'), { status: 400 });
    const payment = await client.query('INSERT INTO payments (invoice_id,amount,payment_date,payment_method,reference,notes,created_by) VALUES ($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5,$6,$7) RETURNING *', [invoiceId,paymentAmount,paymentDate || null,paymentMethod || null,reference || null,notes || null,req.user.id]);
    const paidAmount = Number(invoice.paid_amount) + paymentAmount;
    const status = paidAmount >= Number(invoice.total) ? 'paid' : 'partial';
    await client.query('UPDATE invoices SET paid_amount=$2,status=$3,updated_at=NOW() WHERE id=$1', [invoiceId,paidAmount,status]);
    await client.query('UPDATE customers SET balance=GREATEST(balance-$2,0),updated_at=NOW() WHERE id=$1', [invoice.customer_id,paymentAmount]);
    await client.query('COMMIT');
    await recordAudit(req.user.id, 'create', 'payment', payment.rows[0].id, { invoiceId, amount: paymentAmount });
    res.status(201).json({ payment: payment.rows[0], invoiceStatus: status, outstanding: Math.max(0, outstanding-paymentAmount) });
  } catch (error) { try { await client.query('ROLLBACK'); } catch (_rollbackError) {} next(error); }
  finally { client.release(); }
});

router.get('/sap/status', (req, res) => {
  res.json({ ...sapAdapter.status(), pendingJobs: null, note: 'The API interface exists, but actual SAP communication is not implemented until the engineer identifies the SAP product/API.' });
});

router.get('/sap/outbox', allowRoles('admin','supervisor'), async (_req, res, next) => {
  try {
    const result = await db.query('SELECT id,entity_type,entity_id,operation,status,attempts,last_error,created_at,processed_at FROM sap_sync_jobs ORDER BY created_at DESC LIMIT 500');
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post('/sap/sync', allowRoles('admin','supervisor'), async (_req, res) => {
  res.status(501).json({ error: 'SAP connector not implemented yet.', message: 'The outbox is saving local changes. The SAP engineer must implement the adapter after confirming SAP Business One, ECC or S/4HANA and the supported API.' });
});

module.exports = router;
