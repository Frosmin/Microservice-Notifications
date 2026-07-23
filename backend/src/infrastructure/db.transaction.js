import { getDB } from '@tigo/postgres-connector';

export const withConnection = async (operation) => {
  const client = await getDB().getConnection();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
};

export const withTransaction = async (operation) => withConnection(async (client) => {
  await client.query('BEGIN');
  try {
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
});
