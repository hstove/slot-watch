export default {
  // biome-ignore lint/suspicious/noExplicitAny:allowed
  fetch: (request: Request, env: any) => {
    return env.ASSETS.fetch(request);
  },
};
