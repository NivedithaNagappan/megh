import "reflect-metadata";
import express from "express";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateUserDto } from "./dto";
const app = express();
app.use(express.json());
app.get("/hello", (_q, s) => {
  s.json({ hello: "world" });
});
app.get("/users/:id", (q, s) => {
  s.json({ id: q.params.id, fields: q.query.fields });
});
app.post("/users", async (q, s) => {
  const dto = plainToInstance(CreateUserDto, q.body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    s.status(400).json({ errors });
    return;
  }
  s.json({ ok: true, name: dto.name });
});
app.listen(Number(process.argv[2]), () => console.log("ready"));
