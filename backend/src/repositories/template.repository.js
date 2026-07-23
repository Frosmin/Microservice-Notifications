import { executeQuery } from '@tigo/postgres-connector';

const COLUMNS = 'id, nombre, canal, contenido, variables';

export const insertTemplate = async ({ nombre, canal, contenido, variables }) => {
  const query = `
    INSERT INTO plantilla (nombre, canal, contenido, variables)
    VALUES ($1::varchar, $2::varchar, $3::text, $4::varchar[])
    ON CONFLICT (nombre, canal) DO NOTHING
    RETURNING ${COLUMNS};
  `;

  const rows = await executeQuery(query, [nombre, canal, contenido, variables]);
  return rows[0];
};

export const findTemplateById = async (id) => {
  const query = `
    SELECT ${COLUMNS}
    FROM plantilla
    WHERE id = $1::bigint;
  `;
  const rows = await executeQuery(query, [id]);
  return rows[0];
};

export const updateTemplateById = async (
  id,
  { nombre, canal, contenido, variables }
) => {
  const query = `
    UPDATE plantilla AS target
    SET
      nombre = $2::varchar,
      canal = $3::varchar,
      contenido = $4::text,
      variables = $5::varchar[],
      updated_at = CURRENT_TIMESTAMP
    WHERE target.id = $1::bigint
      AND NOT EXISTS (
        SELECT 1
        FROM plantilla AS duplicate
        WHERE duplicate.nombre = $2::varchar
          AND duplicate.canal = $3::varchar
          AND duplicate.id <> $1::bigint
      )
    RETURNING ${COLUMNS};
  `;
  const rows = await executeQuery(query, [
    id,
    nombre,
    canal,
    contenido,
    variables
  ]);
  return rows[0];
};

export const deleteTemplateById = async (id) => {
  const query = `
    DELETE FROM plantilla AS target
    WHERE target.id = $1::bigint
      AND NOT EXISTS (
        SELECT 1
        FROM notificacion
        WHERE notificacion.plantilla_id = target.id
      )
    RETURNING ${COLUMNS};
  `;
  const rows = await executeQuery(query, [id]);
  return rows[0];
};
