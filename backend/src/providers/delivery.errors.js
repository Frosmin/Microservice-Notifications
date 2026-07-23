export class PermanentDeliveryError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PermanentDeliveryError';
  }
}

export const isPermanentDeliveryError = (error) => (
  error instanceof PermanentDeliveryError
);
