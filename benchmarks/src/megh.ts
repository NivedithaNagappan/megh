import "reflect-metadata";
import {
  Megh,
  ApiController,
  Get,
  Post,
  Param,
  Query,
  Body,
} from "@meghjs/core";
import { CreateUserDto } from "./dto";
@ApiController("/")
class BenchController {
  @Get("/hello") hello() {
    return { hello: "world" };
  }
  @Get("/users/:id") user(
    @Param("id") id: string,
    @Query("fields") fields: string,
  ) {
    return { id, fields };
  }
  @Post("/users") create(@Body() body: CreateUserDto) {
    return { ok: true, name: body.name };
  }
}
const app = Megh.createApplication();
app.useControllers([BenchController]);
app.run(Number(process.argv[2]));
