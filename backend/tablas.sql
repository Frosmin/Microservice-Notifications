DROP TABLE IF EXISTS intento CASCADE;
DROP TABLE IF EXISTS notification_outbox CASCADE;
DROP TABLE IF EXISTS notificacion CASCADE;
DROP TABLE IF EXISTS plantilla CASCADE;

CREATE TABLE plantilla (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    canal VARCHAR(50) NOT NULL,
    contenido TEXT NOT NULL,
    variables VARCHAR(100)[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_plantilla_nombre_canal UNIQUE (nombre, canal),
    CONSTRAINT ck_plantilla_nombre_no_vacio CHECK (BTRIM(nombre) <> ''),
    CONSTRAINT ck_plantilla_canal CHECK (canal IN ('EMAIL', 'SMS')),
    CONSTRAINT ck_plantilla_contenido_no_vacio CHECK (BTRIM(contenido) <> ''),
    CONSTRAINT ck_plantilla_variables_sin_nulos CHECK (
        ARRAY_POSITION(variables, NULL) IS NULL
    )
);


CREATE TABLE notificacion (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    canal VARCHAR(50) NOT NULL,
    destinatario VARCHAR(255) NOT NULL,
    plantilla_id BIGINT NOT NULL REFERENCES plantilla(id) ON DELETE RESTRICT,
    variables JSONB NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    estado VARCHAR(50) NOT NULL DEFAULT 'ENCOLADA',
    intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_notificacion_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT ck_notificacion_canal CHECK (canal IN ('EMAIL', 'SMS')),
    CONSTRAINT ck_notificacion_destinatario_no_vacio CHECK (BTRIM(destinatario) <> ''),
    CONSTRAINT ck_notificacion_estado CHECK (estado IN ('ENCOLADA', 'ENVIADA', 'FALLIDA')),
    CONSTRAINT ck_notificacion_variables_objeto CHECK (JSONB_TYPEOF(variables) = 'object')
);

CREATE TABLE notification_outbox (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_id BIGINT NOT NULL REFERENCES notificacion(id) ON DELETE CASCADE,
    published_at TIMESTAMP WITH TIME ZONE,
    publish_attempts INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
    available_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE intento (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notificacion_id BIGINT NOT NULL REFERENCES notificacion(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL CHECK (numero > 0),
    resultado VARCHAR(20) NOT NULL,
    detalle TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_intento_notificacion_numero UNIQUE (notificacion_id, numero),
    CONSTRAINT ck_intento_resultado CHECK (resultado IN ('EXITOSO', 'FALLIDO'))
);


CREATE INDEX idx_notificacion_plantilla_id ON notificacion(plantilla_id);
CREATE INDEX idx_notificacion_estado ON notificacion(estado);
CREATE INDEX idx_intento_notificacion_id ON intento(notificacion_id);
CREATE INDEX idx_notification_outbox_pending
    ON notification_outbox(available_at, id)
    WHERE published_at IS NULL;
