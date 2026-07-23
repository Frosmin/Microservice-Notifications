import { executeQuery } from '@tigo/postgres-connector';

export const findAttemptsByNotificationId = async (notificationId) => {
  const query = `
    SELECT
      id,
      notificacion_id AS "notificationId",
      numero,
      resultado,
      detalle,
      timestamp
    FROM intento
    WHERE notificacion_id = $1::bigint
    ORDER BY numero ASC;
  `;
  return executeQuery(query, [notificationId]);
};
