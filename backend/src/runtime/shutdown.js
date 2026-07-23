export const closeApiRuntime = async ({ server, closeDatabase }) => {
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
  await closeDatabase();
};

export const closeWorkerRuntime = async ({
  stopPublisher,
  worker,
  queue,
  queueConnection,
  workerConnection,
  closeRedis,
  closeDatabase
}) => {
  await stopPublisher();
  await worker.close();
  await queue.close();
  await Promise.all([
    closeRedis(queueConnection),
    closeRedis(workerConnection)
  ]);
  await closeDatabase();
};
