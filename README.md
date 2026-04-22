# Traveris Pro - Sistema de Gestión para Agencias de Viajes

Traveris Pro es una plataforma SaaS (Software as a Service) diseñada para la gestión integral de agencias de viajes. Permite administrar clientes, reservas, servicios, proveedores y llevar un control financiero detallado (caja, deudas, cobros, pagos y recibos).

Este documento sirve como **contexto central de la arquitectura y lógica del sistema** para futuros desarrollos y mantenimiento. Sirve como referencia tanto para desarrolladores como para asistentes de IA.

## Arquitectura del Sistema

El sistema está dividido en un Frontend (SPA) y un Backend (API REST), conectados a una base de datos relacional.

### 1. Frontend (Repositorio: `traveris2-front`)
- **Framework**: Angular (v17/18+).
- **Estilos**: Vanilla CSS (`styles.css`), con diseño dinámico, modo oscuro, adaptabilidad móvil y estilos enfocados en UI/UX moderna.
- **Despliegue**: Vercel.
- **Estructura Principal**:
  - `src/app/components/`: Componentes principales (dashboard, reservas, clientes, caja, admin).
  - `src/app/services/`: Conexión con el API (`api.service.ts`), generación de PDFs (`recibo-pdf.service.ts`), control de UI (`loading.service.ts`).
  - `src/app/models/`: Interfaces TypeScript de los objetos de datos (`index.ts`).
  - `src/app/guards/`: Protección de rutas según autenticación y roles.

### 2. Backend (Repositorio: `traveris2-back`)
- **Entorno**: Node.js con Express.
- **Base de Datos**: PostgreSQL (alojada en Neon.tech).
- **Validación**: Zod (`src/validators/`).
- **Autenticación**: JWT (JSON Web Tokens) guardados en cookies/headers.
- **Despliegue**: Railway (`traveris-production.up.railway.app`).
- **Estructura Principal**:
  - `src/routes/`: Controladores y endpoints de la API REST (pagos, caja, reservas, servicios, etc.).
  - `src/middlewares/`: `auth.js` (verifica JWT), `resolverEmpresa.js` (extrae la empresa del usuario para multi-tenancy).
  - `src/index.js`: Punto de entrada, configuración de CORS, Rate Limiting y migraciones automáticas.
  - `migrations/`: Scripts SQL para la creación y actualización del esquema de base de datos.

## Lógica de Negocio y Reglas Críticas

### 1. Multi-Tenant (Arquitectura SaaS)
**Regla de Oro**: Todas las tablas principales de la base de datos (clientes, reservas, pagos, etc.) tienen una columna `empresa_nombre`. **Toda consulta al backend DEBE filtrar por `empresa_nombre = req.usuario.empresa_nombre`** para garantizar que una agencia no vea los datos de otra.

### 2. Roles y Permisos
- **EMPRESA**: Usuario estándar de la agencia. Puede operar el sistema completo para su propia agencia.
- **ADMIN**: Superusuario del sistema (acceso a `/admin`). Puede crear nuevas agencias (empresas), crear usuarios, asignar roles y configurar archivos generales para el sistema.

### 3. Módulo Financiero y de Caja
La caja es el corazón financiero de Traveris Pro. El cálculo de saldos y rentabilidad se basa en los movimientos registrados en la tabla `pagos`.

- **Tipos de Movimientos**:
  - `COBRO_CLIENTE`: Dinero que ingresa por pago de una reserva.
  - `PAGO_PROVEEDOR`: Dinero que egresa para pagar un servicio al proveedor.
  - `INGRESO_GENERAL` / `EGRESO_GENERAL`: Movimientos manuales o administrativos.
  - `CONVERSION`: Movimiento doble (un egreso en moneda origen y un ingreso en moneda destino).
  - `AJUSTE_TARJETA`: Para correcciones de saldo.
- **Métodos de Pago**: Todo movimiento (excepto conversión/ajustes) **debe** tener un `metodo_pago_id` asignado. El backend rechaza peticiones sin método válido.
- **Cálculo de Caja**: El balance suma ingresos y resta egresos agrupados por `moneda` (ARS, USD, EUR), **excluyendo** los montos abonados mediante "Tarjeta Puente".

### 4. Flujo de Tarjeta Puente (Tarjetas de Clientes)
Para evitar que pagos realizados con la tarjeta de crédito personal de un cliente inflen falsamente la caja en efectivo/bancos de la agencia, se utiliza el sistema de "Tarjeta Puente":
1. Al crear un `COBRO_CLIENTE` e ingresar los datos de una tarjeta, el dinero no va al saldo de la caja general, sino que se crea un registro en `tarjetas_clientes` con un `monto_disponible`.
2. Ese saldo queda "flotando".
3. Al crear un `PAGO_PROVEEDOR`, se puede seleccionar esa tarjeta específica para consumir su `monto_disponible` y saldar la deuda con el proveedor, sin afectar la contabilidad en bancos/efectivo de la agencia.

### 5. Servicios y Fechas de Pago
Los servicios (Vuelos, Hoteles, Asistencia, Cruceros, etc.) están vinculados a una reserva mediante la tabla `reserva_servicios_detallados`.
- Cuentan con campos financieros fundamentales: `precio_cliente` y `costo_proveedor`. La diferencia representa la ganancia de la agencia.
- **Fechas de Pago**: Cada servicio incluye `fecha_sena` (seña) y `fecha_saldar` (saldo restante) para planificar los cobros y pagos a futuro en un cronograma de vencimientos.

## Consideraciones para el Desarrollo (IA y Agentes)
- **Base de Datos (PostgreSQL)**: Siempre que se agreguen columnas a las tablas, generar un script SQL en el backend (`migrations/`) o agregar un comando seguro `ALTER TABLE IF NOT EXISTS` en el arranque de la aplicación (`src/index.js` -> función `iniciar()`). No mutar el esquema sin versionado o control de inicio.
- **Nomenclatura en Angular**: Debido a limitaciones del lexer de Angular en las plantillas HTML, se debe **evitar el uso de la letra `ñ`** en nombres de variables o propiedades del modelo (ej. usar `fecha_sena` en lugar de `fecha_seña`).
- **Validaciones (Zod)**: Mantener la estricta validación de schemas con `Zod` en el backend antes de ejecutar operaciones de BD para evitar corrupciones de datos. En el frontend, replicar validaciones en los formularios reactivos o template-driven.
- **Sincronización Full-Stack**: Todo cambio en la estructura de datos del backend requiere su correspondiente actualización en las interfaces TypeScript (`src/app/models/index.ts`) del frontend y los servicios de consumo de API (`api.service.ts`).

## Comandos Locales (Desarrollo)

### Frontend (`traveris2-front`):
- Instalar dependencias: `npm install`
- Iniciar servidor de desarrollo: `npm run start` o `npx ng serve` (Expone en `http://localhost:4200`)

### Backend (`traveris2-back`):
- Instalar dependencias: `npm install`
- Iniciar servidor de desarrollo: `npm run dev` (Expone en `http://localhost:3000`)
- Variables de entorno necesarias: `DATABASE_URL`, `JWT_SECRET`, etc. (ver archivo `.env.example` o configurar localmente).

---
*Este documento de arquitectura fue generado para acelerar la comprensión del proyecto completo y establecer estándares claros para el desarrollo continuo.*
