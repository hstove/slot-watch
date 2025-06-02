export default {
  fetch: async (request: Request) => {
    return new Response('Hello World', { status: 200 });
  },
};
