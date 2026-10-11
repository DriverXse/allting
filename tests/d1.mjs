import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
export function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  for (const f of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${f}`, "utf8"));
  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.args) || null;
    }
    async all() {
      return {
        results: sqlite.prepare(this.sql).all(...this.args),
        success: true,
      };
    }
    async raw() {
      const stmt = sqlite.prepare(this.sql);
      stmt.setReturnArrays(true);
      return stmt.all(...this.args);
    }
    async run() {
      return {
        success: true,
        meta: sqlite.prepare(this.sql).run(...this.args),
      };
    }
  }
  let queue = Promise.resolve();
  return {
    sqlite,
    prepare(sql) {
      return new Statement(sql);
    },
    async batch(stmts) {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = [];
        for (const s of stmts) result.push(await s.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      } finally {
        release();
      }
    },
  };
}
