import type { Repository } from "./repository.ts";
import { PostgresRepository } from "./postgres-repository.ts";

let repository: Repository | undefined;

export function getRepository(): Repository {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for server persistence.");
  repository ??= new PostgresRepository(connectionString);
  return repository;
}
