export const lockNextOutboxEvent = async (client) => {
  const result = await client.query(`
    SELECT
      id,
      notification_id AS "notificationId",
      publish_attempts AS "publishAttempts"
    FROM notification_outbox
    WHERE published_at IS NULL
      AND available_at <= NOW()
    ORDER BY available_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  `);
  return result.rows[0];
};

export const markOutboxPublished = async (client, id) => {
  await client.query(`
    UPDATE notification_outbox
    SET published_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
    WHERE id = $1::bigint;
  `, [id]);
};

export const markOutboxPublicationFailed = async (client, id, error, delayMs) => {
  await client.query(`
    UPDATE notification_outbox
    SET publish_attempts = publish_attempts + 1,
        available_at = NOW() + ($2::bigint * INTERVAL '1 millisecond'),
        last_error = LEFT($3::text, 2000),
        updated_at = NOW()
    WHERE id = $1::bigint;
  `, [id, delayMs, error]);
};
