import Fastify from "fastify";
const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
app.get("/hello", async () => ({ hello: "world" }));
app.get<{ Params: { id: string }; Querystring: { fields: string } }>(
  "/users/:id",
  async (r) => ({ id: r.params.id, fields: r.query.fields }),
);
app.post<{ Body: { name: string } }>(
  "/users",
  {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["name", "email", "age"],
        properties: {
          name: { type: "string", minLength: 1 },
          email: { type: "string", format: "email" },
          age: { type: "integer", minimum: 0, maximum: 120 },
        },
      },
    },
  },
  async (r) => ({ ok: true, name: r.body.name }),
);
app.listen({ port: Number(process.argv[2]) }).then(() => console.log("ready"));
