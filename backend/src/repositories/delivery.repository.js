export const acquireNotificationLock = async (client, notificationId) => {
  await client.query('SELECT pg_advisory_lock($1::bigint);', [notificationId]);
};

export const releaseNotificationLock = async (client, notificationId) => {
  await client.query('SELECT pg_advisory_unlock($1::bigint);', [notificationId]);
};

export const findNotificationForDelivery = async (client, notificationId) => {
  const result = await client.query(`
    SELECT
      n.id AS "notificationId",
      n.canal,
      n.destinatario,
      n.variables,
      n.estado,
      n.intentos,
      p.nombre AS "templateName",
      p.contenido AS "templateContent",
      p.variables AS "templateVariables"
    FROM notificacion n
    JOIN plantilla p ON p.id = n.plantilla_id
    WHERE n.id = $1::bigint;
  `, [notificationId]);
  return result.rows[0];
};

export const recordDeliveryAttempt = async (client, {
  notificationId,
  resultado,
  detalle,
  estado
}) => {
  const result = await client.query(`
    WITH updated_notification AS (
      UPDATE notificacion
      SET intentos = intentos + 1,
          estado = $4::varchar,
          updated_at = NOW()
      WHERE id = $1::bigint
      RETURNING intentos
    )
    INSERT INTO intento (notificacion_id, numero, resultado, detalle)
    SELECT $1::bigint, intentos, $2::varchar, LEFT($3::text, 2000)
    FROM updated_notification
    RETURNING id, numero, resultado, detalle, timestamp;
  `, [notificationId, resultado, detalle, estado]);
  return result.rows[0];
};

export const markNotificationFailed = async (client, notificationId) => {
  await client.query(`
    UPDATE notificacion
    SET estado = 'FALLIDA', updated_at = NOW()
    WHERE id = $1::bigint AND estado <> 'ENVIADA';
  `, [notificationId]);
};
