import { config as configDotenv } from "dotenv";
import { resolve } from "path";

export function throwIfNot<T, K extends keyof T>(obj: Partial<T>, prop: K, msg?: string): T[K] {
  if (obj[prop] === undefined || obj[prop] === null || obj[prop] === "") {
    throw new Error(msg || `Environment is missing variable ${String(prop)}`);
  } else {
    return obj[prop] as T[K];
  }
}

export function myDotenvConfig() {
  let targetEnvironment = `../.env.${process.env.NODE_ENV || "development"}`;
  console.log(`Environment: ${resolve(__dirname, targetEnvironment)}`);
  configDotenv({
    path: resolve(__dirname, targetEnvironment),
  });

  let mandatoryEnvParams = ["MNEMONIC", "POLYGONSCAN_API_KEY"];

  mandatoryEnvParams.forEach((v) => {
    throwIfNot(process.env, v);
  });
}
