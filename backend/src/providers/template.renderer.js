import { PermanentDeliveryError } from './delivery.errors.js';

const PLACEHOLDER = /{{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*}}/g;

export const renderTemplate = (content, variables) => {
  const missing = new Set();
  const rendered = content.replace(PLACEHOLDER, (_placeholder, name) => {
    if (!Object.hasOwn(variables, name) || variables[name] === null
      || variables[name] === undefined) {
      missing.add(name);
      return '';
    }
    return String(variables[name]);
  });

  if (missing.size > 0) {
    throw new PermanentDeliveryError(
      `Missing template variables: ${[...missing].join(', ')}`
    );
  }
  return rendered;
};
