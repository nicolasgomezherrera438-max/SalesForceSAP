const bcrypt = require('bcryptjs');
const db = require('../db');

async function seed() {
  const adminHash = await bcrypt.hash('Admin123!', 10);
  const sellerHash = await bcrypt.hash('Seller123!', 10);
  await db.query(`INSERT INTO users (full_name,email,password_hash,role) VALUES ('Administrator Demo','admin@demo.com',$1,'admin') ON CONFLICT (email) DO NOTHING`, [adminHash]);
  await db.query(`INSERT INTO users (full_name,email,password_hash,role) VALUES ('Seller Demo','seller@demo.com',$1,'seller') ON CONFLICT (email) DO NOTHING`, [sellerHash]);
  const admin = (await db.query("SELECT id FROM users WHERE email='admin@demo.com'")).rows[0];
  const seller = (await db.query("SELECT id FROM users WHERE email='seller@demo.com'")).rows[0];

  const customerRows = [
    ['C-1001','Distribuciones Central SAS','900123456-1','Bogota','Calle 10 # 20-30',4.6097100,-74.0817500,1850000],
    ['C-1002','Comercializadora El Parque','901234567-2','Soacha','Carrera 7 # 12-15',4.5793700,-74.2168200,640000],
    ['C-1003','Minimercado La 80','800765432-3','Medellin','Avenida 80 # 30-40',6.2442000,-75.5812000,0]
  ];
  for (const c of customerRows) {
    await db.query(`INSERT INTO customers (code,name,tax_id,city,address,latitude,longitude,assigned_seller_id,balance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (code) DO NOTHING`, [...c.slice(0,7), seller.id, c[7]]);
  }
  const products = [
    ['P-001','Concentrado de maracuya','Bebida concentrada','UND',14000,19,120],
    ['P-002','Pulpa de mango','Pulpa congelada','UND',9500,5,85],
    ['P-003','Jugo de naranja 1L','Bebida lista para consumo','UND',6500,19,200],
    ['P-004','Pulpa de fresa','Pulpa congelada','UND',11000,5,60]
  ];
  for (const p of products) {
    await db.query(`INSERT INTO products (code,name,description,unit,price,tax_rate,stock) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (code) DO NOTHING`, p);
  }
  const customers = (await db.query("SELECT id,code FROM customers WHERE code IN ('C-1001','C-1002','C-1003')")).rows;
  const c1 = customers.find(c => c.code === 'C-1001');
  const c2 = customers.find(c => c.code === 'C-1002');
  if (c1) await db.query(`INSERT INTO invoices (invoice_number,customer_id,issue_date,due_date,subtotal,tax_total,total,paid_amount,status) VALUES ('FAC-DEMO-1001',$1,CURRENT_DATE-35,CURRENT_DATE-5,1554622,295378,1850000,0,'overdue') ON CONFLICT (invoice_number) DO NOTHING`, [c1.id]);
  if (c2) await db.query(`INSERT INTO invoices (invoice_number,customer_id,issue_date,due_date,subtotal,tax_total,total,paid_amount,status) VALUES ('FAC-DEMO-1002',$1,CURRENT_DATE-10,CURRENT_DATE+20,537815,102185,640000,0,'pending') ON CONFLICT (invoice_number) DO NOTHING`, [c2.id]);
  const existingRoute = await db.query("SELECT id FROM routes WHERE route_name='Ruta demo de ventas' AND assigned_seller_id=$1 AND route_date=CURRENT_DATE", [seller.id]);
  if (!existingRoute.rows[0] && c1 && c2) {
    const route = await db.query("INSERT INTO routes (route_name,assigned_seller_id,route_date,notes) VALUES ('Ruta demo de ventas',$1,CURRENT_DATE,'Ruta de ejemplo; reemplazar por la planificacion real') RETURNING id", [seller.id]);
    await db.query('INSERT INTO route_stops (route_id,customer_id,stop_order,planned_time) VALUES ($1,$2,1,$3),($1,$4,2,$5)', [route.rows[0].id,c1.id,'09:00',c2.id,'11:00']);
  }
  console.log('Seed complete. Demo admin: admin@demo.com / Admin123!');
  console.log('Demo seller: seller@demo.com / Seller123!');
}

seed().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.pool.end());
