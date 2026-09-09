import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GameError } from './game.js';

export class Store {
  constructor({ directory, key } = {}) {
    if (directory) mkdirSync(directory, { recursive: true });
    if (!key && directory) {
      const path = join(directory, 'storage.key');
      if (!existsSync(path)) {
        if (existsSync(join(directory, 'practice.sqlite'))) throw new Error('Existing database requires its original storage.key');
        writeFileSync(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
      }
      key = readFileSync(path, 'utf8').trim();
    }
    if (key && !/^[a-f\d]{64}$/i.test(key)) throw new Error('STORAGE_KEY must be 32 bytes in hex');
    this.key = key ? Buffer.from(key, 'hex') : randomBytes(32);
    this.db = new DatabaseSync(directory ? join(directory, 'practice.sqlite') : ':memory:');
    this.db.exec('PRAGMA secure_delete=ON; PRAGMA foreign_keys=ON;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) { this.db.close(); throw new Error('Unsupported database version'); }
    if (version === 0) {
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE records (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, updated INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE INDEX records_owner ON records(owner, kind, updated);
        CREATE TABLE quotas (owner TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(owner, day));
        PRAGMA user_version=1;
        COMMIT;`);
    }
    // Detect a wrong encryption key at startup, before accepting new writes.
    const existing = this.db.prepare('SELECT data FROM records LIMIT 1').get();
    if (existing) { try { this.decode(existing.data); } catch (error) { this.db.close(); throw error; } }
    this.prune();
  }
  encode(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }
  decode(value) {
    const data = Buffer.from(value, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8'));
  }
  save(owner, kind, value) {
    this.db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated, data=excluded.data WHERE records.owner=excluded.owner AND records.kind=excluded.kind')
      .run(value.id, owner, kind, Date.now(), this.encode(value));
  }
  get(owner, id, kind = 'game') {
    const row = this.db.prepare('SELECT data FROM records WHERE id=? AND owner=? AND kind=? AND updated>?').get(id, owner, kind, Date.now() - 30 * 86400_000);
    return row ? this.decode(row.data) : null;
  }
  list(owner, kind = 'game') {
    return this.db.prepare('SELECT data FROM records WHERE owner=? AND kind=? AND updated>? ORDER BY updated DESC LIMIT 100').all(owner, kind, Date.now() - 30 * 86400_000).map(row => this.decode(row.data));
  }
  deleteOwner(owner) { this.db.prepare('DELETE FROM records WHERE owner=?').run(owner); }
  transaction(task) {
    this.db.exec('BEGIN IMMEDIATE');
    try { task(); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  consume(owner, limit = 100, day = new Date().toISOString().slice(0, 10)) {
    const row = this.db.prepare('INSERT INTO quotas VALUES (?, ?, 1) ON CONFLICT(owner, day) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').get(owner, day, limit);
    if (!row) throw new GameError('오늘의 AI 이용 한도에 도달했어요 내일 다시 연습해 주세요', 429);
  }
  consumeAI(owner, dailyLimit, minuteLimit, now = Date.now()) {
    const instant = new Date(now).toISOString();
    this.transaction(() => {
      try { this.consume(owner, dailyLimit, instant.slice(0, 10)); }
      catch (error) {
        if (!(error instanceof GameError)) throw error;
        throw Object.assign(new GameError('오늘의 AI 이용 한도에 도달했어요 한국 시간 오전 9시에 다시 이용할 수 있어요', 429), { retryAfter: Math.ceil((Date.parse(`${instant.slice(0, 10)}T00:00:00Z`) + 86400_000 - now) / 1000) });
      }
      try { this.consume(`minute:${owner}`, minuteLimit, instant.slice(0, 16)); }
      catch (error) {
        if (!(error instanceof GameError)) throw error;
        throw Object.assign(new GameError('AI 요청이 너무 잦아요 잠시 후 다시 시도해 주세요', 429), { retryAfter: 60 - Math.floor(now / 1000) % 60 });
      }
    });
  }
  prune() {
    this.db.prepare('DELETE FROM records WHERE updated<?').run(Date.now() - 30 * 86400_000);
    this.db.prepare('DELETE FROM quotas WHERE day<?').run(new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10));
  }
  close() { this.db.close(); }
}
