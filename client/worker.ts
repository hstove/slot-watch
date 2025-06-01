export default {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  fetch: (request: Request, env: any) => {
    return env.ASSETS.fetch(request);
  },
};
