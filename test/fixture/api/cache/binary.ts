let calls = 0;

export default defineCachedEventHandler(
  () =>
    new Response(new Uint8Array([137, 80, 78, 71, 0, 255]), {
      status: 201,
      headers: {
        "content-type": "image/png",
        "x-image-test": "yes",
        "x-calls": String(++calls),
      },
    }),
  { maxAge: 60, swr: false }
);
