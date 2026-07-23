import { executeQuery } from '@tigo/postgres-connector';
import { withTransaction } from '../infrastructure/db.transaction.js';

const COLUMNS = `
  id,
  canal,
  destinatario,
  plantilla_id AS "plantillaId",
  variables,
  estado,
  intentos,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const insertNotification = async ({
  canal,
  destinatario,
  plantillaId,
  variables,
  idempotencyKey
}) => {
  const query = `
    INSERT INTO notificacion (
      canal, destinatario, plantilla_id, variables, idempotency_key
    )
    VALUES ($1::varchar, $2::varchar, $3::bigint, $4::jsonb, $5::varchar)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING ${COLUMNS};
  `;
  return withTransaction(async (client) => {
    const result = await client.query(query, [
      canal,
      destinatario,
      plantillaId,
      JSON.stringify(variables),
      idempotencyKey
    ]);
    const created = result.rows[0];
    if (!created) return undefined;

    await client.query(
      `
        INSERT INTO notification_outbox (notification_id)
        VALUES ($1::bigint);
      `,
      [created.id]
    );
    return created;
  });
};

export const findNotificationByIdempotencyKey = async (idempotencyKey) => {
  const query = `
    SELECT ${COLUMNS}
    FROM notificacion
    WHERE idempotency_key = $1::varchar;
  `;
  const rows = await executeQuery(query, [idempotencyKey]);
  return rows[0];
};

export const findNotificationById = async (id) => {
  const query = `
    SELECT ${COLUMNS}
    FROM notificacion
    WHERE id = $1::bigint;
  `;
  const rows = await executeQuery(query, [id]);
  return rows[0];
};

export const findNotificationByIdForUpdate = async (client, id) => {
  const result = await client.query(`
    SELECT ${COLUMNS}
    FROM notificacion
    WHERE id = $1::bigint
    FOR UPDATE;
  `, [id]);
  return result.rows[0];
};

export const scheduleNotificationRetry = async (client, id, delayMs) => {
  const result = await client.query(`
    UPDATE notificacion
    SET estado = 'ENCOLADA', updated_at = NOW()
    WHERE id = $1::bigint
    RETURNING ${COLUMNS};
  `, [id]);

  await client.query(`
    INSERT INTO notification_outbox (notification_id, available_at)
    VALUES (
      $1::bigint,
      NOW() + ($2::bigint * INTERVAL '1 millisecond')
    );
  `, [id, delayMs]);

  return result.rows[0];
};

export const findNotificationsPage = async ({ canal, estado, limit, offset }) => {
  const filterParameters = [canal ?? null, estado ?? null];
  const filters = `
    WHERE ($1::varchar IS NULL OR canal = $1::varchar)
      AND ($2::varchar IS NULL OR estado = $2::varchar)
  `;
  const countQuery = `
    SELECT COUNT(*) AS "totalItems"
    FROM notificacion
    ${filters};
  `;
  const pageQuery = `
    SELECT ${COLUMNS}
    FROM notificacion
    ${filters}
    ORDER BY created_at DESC, id DESC
    LIMIT $3::integer
    OFFSET $4::bigint;
  `;

  const [countRows, items] = await Promise.all([
    executeQuery(countQuery, filterParameters),
    executeQuery(pageQuery, [...filterParameters, limit, offset])
  ]);

  return {
    items,
    totalItems: Number(countRows[0]?.totalItems ?? 0)
  };
};
