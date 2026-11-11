import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Module,
} from "@nestjs/common";
import { CreateUserDto } from "./dto";
@Controller()
class BenchController {
  @Get("hello") hello() {
    return { hello: "world" };
  }
  @Get("users/:id") user(
    @Param("id") id: string,
    @Query("fields") fields: string,
  ) {
    return { id, fields };
  }
  @Post("users") create(@Body() body: CreateUserDto) {
    return { ok: true, name: body.name };
  }
}
@Module({ controllers: [BenchController] })
export class AppModule {}
