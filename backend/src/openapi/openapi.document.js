import { readFileSync } from 'node:fs';

const documentUrl = new URL('../../docs/openapi.json', import.meta.url);

export const openapiDocument = JSON.parse(readFileSync(documentUrl, 'utf8'));

export default openapiDocument;
