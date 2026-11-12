/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 *
 * Guards for DTOs that mix Megh's decorators with class-validator's or
 * class-transformer's. Each library only sees its own rules, so a mixed DTO
 * would silently skip some of them.
 */
import { isMeghValidatorClass } from "./metadata";
import { getTransformerProperties } from "../openapi/schema-properties";

function hasClassValidatorRules(target: Function): boolean {
  try {
    const { getMetadataStorage } = require("class-validator");
    return (
      getMetadataStorage().getTargetValidationMetadatas(
        target,
        undefined,
        true,
        false,
      ).length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Throw when `target` uses Megh decorators together with class-validator or
 * class-transformer ones.
 */
export function assertMeghOnly(target: Function) {
  if (!isMeghValidatorClass(target)) return;
  const other = hasClassValidatorRules(target)
    ? "class-validator"
    : getTransformerProperties(target).length > 0
      ? "class-transformer"
      : undefined;
  if (other) {
    throw new Error(
      `[Megh] ${target.name} mixes @meghjs/core validation decorators with ${other} ones. ` +
        "Import every decorator of this DTO from one place (e.g. IsString, Type and Transform from \"@meghjs/core\").",
    );
  }
}
