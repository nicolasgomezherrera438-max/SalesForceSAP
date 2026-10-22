# SalesForceSAP - Frontend + Backend (MVP)

Proyecto integrado de fuerza de ventas. Incluye frontend web responsive instalable como PWA (adaptado a celular y escritorio), API REST Node.js, PostgreSQL, autenticacion JWT, clientes, productos, pedidos, facturas, cartera, rutas, visitas, pagos, dashboard y una cola de salida (outbox) para futuras operaciones SAP.

> **Importante:** este proyecto guarda datos en su propia base PostgreSQL. El conector SAP es un punto de extension preparado, no una integracion SAP activa. No se puede conectar de forma segura sin confirmar si la empresa usa SAP Business One, SAP ECC o SAP S/4HANA y que API tiene habilitada. Los pedidos se guardan localmente y quedan en `sap_sync_jobs` hasta que el ingeniero implemente el adaptador.

## Requisitos

- Docker Desktop y Docker Compose (forma mas facil), o Node.js 20+ y PostgreSQL 14+.
- Visual Studio Code es suficiente para editar el codigo.

## Inicio rapido con Docker

1. Descomprime el ZIP y abre esta carpeta en VS Code.
2. En una terminal ubicada en la carpeta del proyecto, ejecuta:

   ```bash
   docker compose up --build
   ```

3. Comprueba que la API responde: `http://localhost:3000/api/health`
4. Abre la aplicacion frontend en `http://localhost:3000` (tambien funciona desde el navegador del celular en la misma red si usas la IP del computador). API base: `http://localhost:3000/api`
5. Para detener: `Ctrl+C`; o `docker compose down`.

PostgreSQL queda expuesto en `localhost:5432` para desarrollo. La base de datos se inicializa desde `database/schema.sql` la primera vez que se crea el volumen.


## Frontend incluido

La carpeta `frontend/public` contiene la interfaz responsive de SalesForceSAP. El backend sirve estos archivos desde la raiz (`http://localhost:3000`) y el frontend consume la API bajo `/api`. Incluye login, dashboard con grafico, clientes, productos, pedidos, facturas, cartera, rutas, visitas y estado/cola de SAP. En Android puede abrirse desde Chrome y agregarse a la pantalla de inicio como aplicacion web progresiva (PWA). Esto no es un APK nativo de Flutter.

La interfaz usa los usuarios demo descritos arriba. En desarrollo, el formulario de login viene precargado con el usuario administrador demo para facilitar la prueba; cambia estas credenciales antes de usar datos reales.

## Usuarios de demostracion

- Administrador: `admin@demo.com` / `Admin123!`
- Vendedor: `seller@demo.com` / `Seller123!`

Son credenciales de desarrollo. Cambialas y cambia `JWT_SECRET` antes de cualquier despliegue real. No publiques este backend directamente en internet con las credenciales de demo.

## Inicio sin Docker

1. Instala PostgreSQL y crea una base `salesforce`, usuario `salesapp` y contrasena segura.
2. Ejecuta `database/schema.sql` contra esa base, por ejemplo:

   ```bash
   psql "postgres://salesapp:TU_PASSWORD@localhost:5432/salesforce" -f database/schema.sql
   ```

3. Copia `.env.example` a `.env` y ajusta `DATABASE_URL` y `JWT_SECRET`.
4. Instala y carga datos de demostracion:

   ```bash
   npm install
   npm run db:seed
   npm start
   ```

## Endpoints principales

Todas las rutas bajo `/api` requieren `Authorization: Bearer <token>`, excepto `/api/health` y `/api/auth/login`.

| Metodo | Ruta | Funcion |
|---|---|---|
| GET | `/api/health` | Estado de API y base de datos |
| POST | `/api/auth/login` | Login y token JWT |
| GET | `/api/auth/me` | Usuario del token |
| GET | `/api/dashboard` | Indicadores y ventas de los ultimos 7 dias |
| GET/POST | `/api/customers` | Listar/buscar o crear clientes |
| GET/PUT | `/api/customers/:id` | Detalle/actualizar cliente |
| GET/POST | `/api/products` | Listar/buscar productos; crear requiere admin/supervisor |
| GET | `/api/invoices` | Consultar facturas |
| GET | `/api/receivables` | Cartera pendiente y vencida |
| GET/POST | `/api/orders` | Historial y creacion de pedidos |
| GET | `/api/orders/:id` | Pedido y lineas |
| GET/POST | `/api/routes` | Consultar rutas; crear requiere admin/supervisor |
| GET/POST | `/api/visits` | Consultar y registrar visitas |
| POST | `/api/payments` | Registrar pago; requiere admin/supervisor |
| GET | `/api/sap/status` | Estado del punto de integracion SAP |
| GET | `/api/sap/outbox` | Cola de operaciones pendientes para SAP |
| POST | `/api/sap/sync` | Por ahora devuelve 501 hasta implementar el conector |

Los vendedores solo consultan clientes, pedidos, rutas y visitas de su alcance segun las reglas de las rutas implementadas. Revisa los permisos antes de pasar a produccion.

## Ejemplos de uso

### 1. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.com","password":"Admin123!"}'
```

Copia el campo `token` de la respuesta y usalo como `Bearer TOKEN`.

### 2. Consultar clientes

```bash
curl http://localhost:3000/api/customers \
  -H 'Authorization: Bearer TOKEN'
```

### 3. Crear un pedido

Usa IDs reales de `/api/customers` y `/api/products`:

```json
{
  "customerId": 1,
  "notes": "Entrega solicitada para esta semana",
  "items": [
    { "productId": 1, "quantity": 12 },
    { "productId": 2, "quantity": 5 }
  ]
}
```

El backend calcula subtotal, impuesto y total usando los precios del catalogo del servidor; no confia en precios enviados por el celular. El pedido y sus lineas se guardan en una transaccion y se crea una fila pendiente en `sap_sync_jobs`.

## Integracion SAP: donde trabaja el ingeniero

1. Confirmar el producto SAP y la API habilitada (por ejemplo, Service Layer de Business One o APIs/OData para ECC/S/4HANA).
2. En el servidor, configurar las variables de `.env` basadas en `.env.example`: `SAP_MODE`, `SAP_BASE_URL`, `SAP_COMPANY_DB`, `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_AUTH_TYPE` y `SAP_TIMEOUT_MS`.
3. Implementar los metodos de `src/integrations/sap/sap.adapter.js`: `createSalesOrder`, `fetchCustomers`, `fetchProducts` y `fetchInvoices` usando el contrato real y el manejo de sesion/token que exija SAP.
4. Implementar el procesador de `sap_sync_jobs` con reintentos, idempotencia, logs sin secretos y mapeo de IDs SAP (`sap_id`).
5. Probar con ambiente SAP de calidad antes de activar produccion.

**No** pongas URL privada, contrasenas ni tokens de SAP dentro de Flutter o de la app Android. La app debe llamar a este backend y el backend llama a SAP.

## Modelo de datos

- `users`: cuentas y roles.
- `customers`: clientes, vendedor asignado y referencia SAP (`sap_id`).
- `products`: catalogo, precio, impuesto, stock y referencia SAP.
- `invoices`, `payments`: facturas y pagos.
- `sales_orders`, `sales_order_items`: pedidos y detalle.
- `routes`, `route_stops`, `visits`: ruteros y visitas.
- `sap_sync_jobs`: cola de salida para sincronizacion futura.
- `audit_log`: eventos basicos de auditoria.

## Antes de produccion

- Rotar contrasenas demo y usar secretos fuertes.
- Restringir CORS a los dominios necesarios.
- Configurar HTTPS, backups y monitoreo de PostgreSQL.
- Agregar rate limiting, politica de contrasenas, recuperacion de cuenta y gestion de sesiones.
- Revisar permisos y aislamiento de datos con el equipo de seguridad.
- Implementar pruebas automatizadas y confirmar reglas fiscales/comerciales de la empresa.
- Acordar con el ingeniero el sistema maestro de cada dato (SAP o backend). Evitar que la app genere facturas fiscales: normalmente SAP debe ser quien contabilice/emita el documento oficial.
