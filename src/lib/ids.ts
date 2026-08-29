import { randomBytes } from "crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}
