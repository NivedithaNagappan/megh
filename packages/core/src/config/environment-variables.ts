/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */

import dotenv from "dotenv";
import path from "path";
import fs, { existsSync } from "fs";
import { Injectable } from "../di";
import {
  EnvironmentVariableNotFound,
  SystemUseError,
} from "../common/exceptions/system-exception";

// Load `.env` into process.env on import, so module-level code can read it.
// Set MEGH_DOTENV=false to skip this and manage the environment yourself.
if (process.env.MEGH_DOTENV !== "false") {
  dotenv.config({ path: path.join(process.cwd(), ".env"), quiet: true });
}

/** Parsed `.env` files by path. Read once; see `Environment.reload()`. */
const fileCache = new Map<string, Record<string, string> | null>();
/**
 * @class Environment
 * @description A service class to manage access to environment variables.
 * It loads variables from `.env` file and merges them with `process.env`,
 * giving precedence to `process.env` values.
 */
@Injectable()
export class Environment {
  /**
   * Parses the given `.env` file and merges it with `process.env`.
   * Values from `process.env` take precedence.
   *
   * @private
   * @param filePath - Absolute path to the `.env` file.
   * @returns A dictionary of merged environment variables.
   */
  private parseEnvFile(filePath: string): any {
    if (!fileCache.has(filePath)) {
      try {
        fileCache.set(
          filePath,
          existsSync(filePath)
            ? dotenv.parse(fs.readFileSync(filePath, "utf8"))
            : {},
        );
      } catch (error) {
        console.error(`Error parsing .env file: ${error}`);
        fileCache.set(filePath, null);
      }
    }
    const parsed = fileCache.get(filePath);
    // process.env is read on every call, so runtime changes still show.
    return parsed === null ? {} : { ...parsed, ...process.env };
  }

  /** Forget the cached `.env` contents so the next read loads the file again. */
  static reload(): void {
    fileCache.clear();
  }

  /**
   * Retrieves the value of the specified environment variable.
   *
   * @template T
   * @param key - The name of the environment variable.
   * @returns The value of the variable, or `undefined` if not found.
   */
  get<T = any>(key: string): T {
    const parsedEnv = this.parseEnvFile(path.join(process.cwd(), ".env"));
    return parsedEnv[key] as T;
  }

  /**
   * Retrieves the value of the specified environment variable.
   * Throws an error if the variable is not found.
   *
   * @template T
   * @param key - The name of the environment variable.
   * @throws {EnvironmentVariableNotFound} If the variable does not exist.
   * @returns The value of the variable.
   */
  getOrThrow<T = any>(key: string): T {
    const parsedEnv = this.parseEnvFile(path.join(process.cwd(), ".env"));
    if (!Object(parsedEnv).hasOwnProperty(key)) {
      throw new EnvironmentVariableNotFound(key);
    }
    return parsedEnv[key] as T;
  }

  /**
   * Retrieves all available environment variables,
   * with `process.env` values taking precedence over `.env` values.
   *
   * @template T
   * @returns An object containing all environment variables.
   */
  getAll<T = any>(): T {
    const parsedEnv = this.parseEnvFile(path.join(process.cwd(), ".env"));
    return parsedEnv as T;
  }
}
