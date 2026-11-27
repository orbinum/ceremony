/** A private upload streamed to the verifier, exactly its stored length. */
export const objectResponse = (object: R2ObjectBody): Response =>
  new Response(object.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(object.size),
    },
  });
