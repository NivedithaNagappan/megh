import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsInt,
  Min,
  Max,
} from "class-validator";
export class CreateUserDto {
  @IsString() @IsNotEmpty() name: string;
  @IsEmail() email: string;
  @IsInt() @Min(0) @Max(120) age: number;
}
