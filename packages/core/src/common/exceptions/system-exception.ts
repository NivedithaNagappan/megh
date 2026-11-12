/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
export class SystemUseError extends Error {
  constructor(message: string) {
    super(message);
  }
}
export class EnvironmentVariableNotFound extends Error {
  constructor(key: string) {
    super(`${key} not found in environment variables.`);
  }
}
