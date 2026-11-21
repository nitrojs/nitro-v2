import fsp from "node:fs/promises";
import { consola, type ConsolaInstance } from "consola";
import { dirname } from "pathe";
import { prettyPath } from "./path";

export async function writeFile(
  file: string,
  contents: Buffer | string,
  log: boolean | ConsolaInstance = false
) {
  await fsp.mkdir(dirname(file), { recursive: true });
  await fsp.writeFile(
    file,
    contents,
    typeof contents === "string" ? "utf8" : undefined
  );
  if (log) {
    const logger = log === true ? consola : log;
    logger.info("Generated", prettyPath(file));
  }
}

export async function isDirectory(path: string) {
  try {
    return (await fsp.stat(path)).isDirectory();
  } catch {
    return false;
  }
}
