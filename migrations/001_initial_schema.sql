-- ============================================================================
-- TRAVERIS PRO — SCHEMA COMPLETO v2.0
-- Rebuild desde cero con modelo contable corregido
-- ============================================================================

-- Limpiar tablas viejas si existen (orden inverso por dependencias)
DROP TABLE IF EXISTS recibos CASCADE;
DROP TABLE IF EXISTS tarjetas_clientes CASCADE;
DROP TABLE IF EXISTS pagos CASCADE;
DROP TABLE IF EXISTS deudas_servicio CASCADE;
DROP TABLE IF EXISTS metodos_pago CASCADE;
DROP TABLE IF EXISTS reserva_archivos CASCADE;
DROP TABLE IF EXISTS reserva_vuelos CASCADE;
DROP TABLE IF EXISTS reserva_pasajeros CASCADE;
DROP TABLE IF EXISTS reserva_servicios_detallados CASCADE;
DROP TABLE IF EXISTS reservas CASCADE;
DROP TABLE IF EXISTS cliente_archivos CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS proveedores CASCADE;
DROP TABLE IF EXISTS agencias_config CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- Limpiar tablas del sistema anterior que ya no existen
DROP TABLE IF EXISTS movimientos_caja CASCADE;
DROP TABLE IF EXISTS medios_tarjeta CASCADE;
DROP TABLE IF EXISTS medios_transferencia CASCADE;

-- ============================================================================
-- 1. USUARIOS
-- ============================================================================
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre_usuario VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'EMPRESA' CHECK (rol IN ('ADMIN', 'EMPRESA')),
    empresa_nombre VARCHAR(100),
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_nombre);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);

-- ============================================================================
-- 2. AGENCIAS_CONFIG
-- ============================================================================
CREATE TABLE agencias_config (
    id SERIAL PRIMARY KEY,
    empresa_nombre VARCHAR(100) NOT NULL UNIQUE,
    nombre_comercial VARCHAR(200),
    titular VARCHAR(200),
    cuit_cuil VARCHAR(30),
    condicion_fiscal VARCHAR(50) CHECK (condicion_fiscal IN ('MONOTRIBUTO', 'RESP_INSCRIPTO', 'EXENTO')),
    domicilio TEXT,
    telefono VARCHAR(50),
    email VARCHAR(100),
    pagina_web VARCHAR(200),
    logo_url TEXT,
    recibo_template VARCHAR(30) DEFAULT 'DEFAULT',
    recibo_config JSONB DEFAULT '{"primaryColor":"#6366F1","secondaryColor":"#8B5CF6","fontFamily":"Inter","logoPosition":"left","showArcaLogo":true,"extraText":""}'::jsonb,
    recibo_footer_legal TEXT,
    activa BOOLEAN DEFAULT TRUE,
    creada_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizada_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. CLIENTES
-- ============================================================================
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nombre_completo VARCHAR(200) NOT NULL,
    dni_pasaporte VARCHAR(50),
    email VARCHAR(100),
    telefono VARCHAR(50),
    fecha_nacimiento DATE,
    cuit_cuil VARCHAR(30),
    nacionalidad VARCHAR(50),
    pasaporte_nro VARCHAR(50),
    pasaporte_emision DATE,
    pasaporte_vencimiento DATE,
    sexo VARCHAR(20),
    pref_asiento VARCHAR(50),
    pref_comida VARCHAR(50),
    observaciones_salud TEXT,
    empresa_nombre VARCHAR(100) NOT NULL,
    dni_emision DATE,
    dni_vencimiento DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clientes_empresa ON clientes(empresa_nombre);
CREATE INDEX idx_clientes_nombre ON clientes(nombre_completo);
CREATE INDEX idx_clientes_dni ON clientes(dni_pasaporte);

-- ============================================================================
-- 4. CLIENTE_ARCHIVOS
-- ============================================================================
CREATE TABLE cliente_archivos (
    id SERIAL PRIMARY KEY,
    id_cliente INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo TEXT NOT NULL,
    tipo_archivo VARCHAR(50),
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cliente_archivos_cliente ON cliente_archivos(id_cliente);

-- ============================================================================
-- 5. PROVEEDORES
-- ============================================================================
CREATE TABLE proveedores (
    id SERIAL PRIMARY KEY,
    empresa_nombre VARCHAR(100) NOT NULL,
    nombre_comercial VARCHAR(100) NOT NULL,
    razon_social_cuit VARCHAR(100),
    contacto VARCHAR(100),
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_proveedores_empresa ON proveedores(empresa_nombre);

-- ============================================================================
-- 6. RESERVAS
-- ============================================================================
CREATE TABLE reservas (
    id SERIAL PRIMARY KEY,
    id_titular INTEGER NOT NULL REFERENCES clientes(id),
    destino_final VARCHAR(255),
    fecha_viaje_salida DATE,
    fecha_viaje_regreso DATE,
    operador_mayorista VARCHAR(100),
    nro_expediente_operador VARCHAR(100),
    empresa_nombre VARCHAR(100) NOT NULL,
    observaciones_internas TEXT,
    estado VARCHAR(20) DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'CERRADO', 'CANCELADO')),
    fecha_limite_pago DATE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado_eliminado BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_reservas_empresa ON reservas(empresa_nombre);
CREATE INDEX idx_reservas_titular ON reservas(id_titular);
CREATE INDEX idx_reservas_estado ON reservas(estado);
CREATE INDEX idx_reservas_fecha ON reservas(fecha_creacion);

-- ============================================================================
-- 7. RESERVA_PASAJEROS
-- ============================================================================
CREATE TABLE reserva_pasajeros (
    id SERIAL PRIMARY KEY,
    id_reserva INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    id_cliente INTEGER NOT NULL REFERENCES clientes(id),
    es_titular BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_reserva_pasajeros_reserva ON reserva_pasajeros(id_reserva);

-- ============================================================================
-- 8. RESERVA_VUELOS
-- ============================================================================
CREATE TABLE reserva_vuelos (
    id SERIAL PRIMARY KEY,
    id_reserva INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    aerolinea VARCHAR(100),
    nro_vuelo VARCHAR(50),
    origen VARCHAR(100),
    destino VARCHAR(100),
    fecha_salida TIMESTAMP,
    fecha_llegada TIMESTAMP,
    clase VARCHAR(50),
    codigo_reserva VARCHAR(50),
    observaciones TEXT
);

CREATE INDEX idx_reserva_vuelos_reserva ON reserva_vuelos(id_reserva);

-- ============================================================================
-- 9. RESERVA_ARCHIVOS
-- ============================================================================
CREATE TABLE reserva_archivos (
    id SERIAL PRIMARY KEY,
    id_reserva INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo TEXT NOT NULL,
    tipo_archivo VARCHAR(50),
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reserva_archivos_reserva ON reserva_archivos(id_reserva);

-- ============================================================================
-- 10. RESERVA_SERVICIOS_DETALLADOS (polimórfica por tipo)
-- ============================================================================
CREATE TABLE reserva_servicios_detallados (
    id SERIAL PRIMARY KEY,
    id_reserva INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    tipo_servicio VARCHAR(30) NOT NULL CHECK (tipo_servicio IN ('HOTEL', 'VUELO', 'ASISTENCIA', 'VISA', 'CRUCERO', 'SERVICIO')),
    descripcion TEXT,

    -- Campos polimórficos HOTEL
    hotel_nombre VARCHAR(200),
    hotel_ciudad VARCHAR(100),
    hotel_check_in DATE,
    hotel_check_out DATE,
    hotel_regimen VARCHAR(50),
    hotel_noches INTEGER,
    hotel_categoria VARCHAR(30),

    -- Campos polimórficos VUELO
    vuelo_aerolinea VARCHAR(100),
    vuelo_nro VARCHAR(50),
    vuelo_origen VARCHAR(100),
    vuelo_destino VARCHAR(100),
    vuelo_fecha_salida TIMESTAMP,
    vuelo_fecha_llegada TIMESTAMP,
    vuelo_clase VARCHAR(50),
    vuelo_codigo_reserva VARCHAR(50),

    -- Campos polimórficos ASISTENCIA
    asistencia_compania VARCHAR(100),
    asistencia_plan VARCHAR(100),
    asistencia_fecha_desde DATE,
    asistencia_fecha_hasta DATE,
    asistencia_cobertura TEXT,

    -- Campos polimórficos VISA
    visa_pais VARCHAR(100),
    visa_tipo VARCHAR(50),
    visa_fecha_tramite DATE,
    visa_nro_tramite VARCHAR(50),

    -- Campos polimórficos CRUCERO
    crucero_naviera VARCHAR(100),
    crucero_barco VARCHAR(100),
    crucero_itinerario TEXT,
    crucero_cabina VARCHAR(50),
    crucero_fecha_embarque DATE,
    crucero_fecha_desembarque DATE,

    -- Fechas de pago generales
    fecha_sena DATE,
    fecha_saldar DATE,

    -- Financieros UNIFICADOS
    id_proveedor INTEGER REFERENCES proveedores(id),
    moneda VARCHAR(5) NOT NULL CHECK (moneda IN ('ARS', 'USD', 'EUR')),
    precio_cliente NUMERIC(14,2) NOT NULL DEFAULT 0,
    costo_proveedor NUMERIC(14,2) NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_servicios_reserva ON reserva_servicios_detallados(id_reserva);
CREATE INDEX idx_servicios_proveedor ON reserva_servicios_detallados(id_proveedor);
CREATE INDEX idx_servicios_tipo ON reserva_servicios_detallados(tipo_servicio);

-- ============================================================================
-- 11. DEUDAS_SERVICIO (CORAZÓN CONTABLE)
-- ============================================================================
CREATE TABLE deudas_servicio (
    id SERIAL PRIMARY KEY,
    id_servicio INTEGER NOT NULL REFERENCES reserva_servicios_detallados(id) ON DELETE CASCADE,
    id_reserva INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    id_proveedor INTEGER REFERENCES proveedores(id),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('CLIENTE', 'PROVEEDOR')),
    moneda VARCHAR(5) NOT NULL CHECK (moneda IN ('ARS', 'USD', 'EUR')),
    monto_total NUMERIC(14,2) NOT NULL,
    monto_pagado NUMERIC(14,2) NOT NULL DEFAULT 0,
    empresa_nombre VARCHAR(100) NOT NULL,
    creada_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deudas_reserva ON deudas_servicio(id_reserva);
CREATE INDEX idx_deudas_servicio ON deudas_servicio(id_servicio);
CREATE INDEX idx_deudas_proveedor ON deudas_servicio(id_proveedor, tipo, moneda);
CREATE INDEX idx_deudas_empresa ON deudas_servicio(empresa_nombre);

-- ============================================================================
-- 12. METODOS_PAGO
-- ============================================================================
CREATE TABLE metodos_pago (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    moneda VARCHAR(5) NOT NULL CHECK (moneda IN ('ARS', 'USD', 'EUR')),
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA')),
    activo BOOLEAN DEFAULT TRUE,
    empresa_nombre VARCHAR(100) NOT NULL
);

CREATE INDEX idx_metodos_pago_empresa ON metodos_pago(empresa_nombre, moneda);

-- ============================================================================
-- 13. TARJETAS_CLIENTES (PUENTE — NO billetera)
-- ============================================================================
CREATE TABLE tarjetas_clientes (
    id SERIAL PRIMARY KEY,
    titular VARCHAR(100) NOT NULL,
    numero_mask VARCHAR(30) NOT NULL,
    expiracion VARCHAR(10),
    banco_detectado VARCHAR(100),
    moneda VARCHAR(5) DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD', 'EUR')),
    monto_original NUMERIC(14,2) NOT NULL,
    monto_disponible NUMERIC(14,2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'CONSUMIDA', 'LIQUIDADA')),
    fecha_cobro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_pago_origen INTEGER, -- FK se agrega después de crear pagos
    empresa_nombre VARCHAR(100) NOT NULL
);

CREATE INDEX idx_tarjetas_empresa ON tarjetas_clientes(empresa_nombre);
CREATE INDEX idx_tarjetas_estado ON tarjetas_clientes(estado);

-- ============================================================================
-- 14. PAGOS (reemplaza movimientos_caja)
-- ============================================================================
CREATE TABLE pagos (
    id SERIAL PRIMARY KEY,
    id_reserva INTEGER REFERENCES reservas(id) ON DELETE SET NULL,
    id_servicio INTEGER REFERENCES reserva_servicios_detallados(id) ON DELETE SET NULL,
    id_deuda INTEGER REFERENCES deudas_servicio(id) ON DELETE SET NULL,
    id_proveedor INTEGER REFERENCES proveedores(id),
    id_cliente INTEGER REFERENCES clientes(id),
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN (
        'COBRO_CLIENTE', 'PAGO_PROVEEDOR',
        'INGRESO_GENERAL', 'EGRESO_GENERAL',
        'CONVERSION', 'AJUSTE_TARJETA'
    )),
    moneda VARCHAR(5) NOT NULL CHECK (moneda IN ('ARS', 'USD', 'EUR')),
    monto NUMERIC(14,2) NOT NULL,
    metodo_pago_id INTEGER REFERENCES metodos_pago(id),
    id_tarjeta_cliente INTEGER REFERENCES tarjetas_clientes(id),
    observaciones TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    empresa_nombre VARCHAR(100) NOT NULL,
    anulado BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_pagos_empresa_fecha ON pagos(empresa_nombre, fecha);
CREATE INDEX idx_pagos_reserva ON pagos(id_reserva);
CREATE INDEX idx_pagos_deuda ON pagos(id_deuda);
CREATE INDEX idx_pagos_tipo ON pagos(tipo);

-- Agregar FK circular tarjetas → pagos
ALTER TABLE tarjetas_clientes
    ADD CONSTRAINT fk_tarjeta_pago_origen
    FOREIGN KEY (id_pago_origen) REFERENCES pagos(id);

-- ============================================================================
-- 15. RECIBOS
-- ============================================================================
CREATE TABLE recibos (
    id SERIAL PRIMARY KEY,
    numero_recibo INTEGER NOT NULL,
    id_pago INTEGER REFERENCES pagos(id),
    id_reserva INTEGER REFERENCES reservas(id),
    id_cliente INTEGER REFERENCES clientes(id),
    nombre_cliente VARCHAR(200),
    dni_cliente VARCHAR(50),
    concepto TEXT,
    moneda VARCHAR(5) NOT NULL CHECK (moneda IN ('ARS', 'USD', 'EUR')),
    monto NUMERIC(14,2) NOT NULL,
    metodo_pago VARCHAR(100),
    empresa_nombre VARCHAR(100) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    anulado BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_recibos_empresa ON recibos(empresa_nombre);
CREATE INDEX idx_recibos_numero ON recibos(empresa_nombre, numero_recibo);
CREATE INDEX idx_recibos_pago ON recibos(id_pago);

-- ============================================================================
-- COMENTARIO FINAL
-- ============================================================================
-- Tablas ELIMINADAS definitivamente del sistema:
--   - movimientos_caja
--   - medios_tarjeta
--   - medios_transferencia
-- El dinero nace en deudas_servicio y fluye a través de pagos.
-- Tarjetas son puente, no billetera.
-- ============================================================================
