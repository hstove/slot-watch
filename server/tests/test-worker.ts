export default {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  // biome-ignore lint/correctness/noUnusedFunctionParameters: ignored using `--suppress`
  fetch: async (request: Request) => {
    return new Response('Hello World', { status: 200 });
  },
};
