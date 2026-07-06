'use strict';
/**
 * Plain-Node download queue. Owns job state + persistence (queue.json) and
 * drives a caller-supplied `runner(job, ctx)` async function with a
 * concurrency limit (1-3). Fully decoupled from Electron/yt-dlp so it can be
 * unit-tested with a stubbed runner (see test/smoke.js).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

const ACTIVE_STATUSES = new Set(['queued', 'probing', 'downloading', 'processing']);

class JobQueue extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.dataDir - where queue.json is persisted
   * @param {number} [opts.concurrency=1]
   * @param {(job: object, ctx: {onProgress: Function, signal: AbortSignal}) => Promise<void>} opts.runner
   */
  constructor({ dataDir, concurrency = 1, runner }) {
    super();
    if (typeof runner !== 'function') throw new Error('JobQueue requires a runner function');
    this.dataDir = dataDir;
    this.concurrency = Math.max(1, Math.min(3, concurrency));
    this.runner = runner;
    this.jobs = new Map();
    this.order = [];
    this.active = new Map();
    this._load();
  }

  _queuePath() {
    return path.join(this.dataDir, 'queue.json');
  }

  _load() {
    try {
      const raw = fs.readFileSync(this._queuePath(), 'utf8');
      const data = JSON.parse(raw);
      for (const job of data.jobs || []) {
        // A job that was mid-flight when the app last closed goes back to queued.
        if (ACTIVE_STATUSES.has(job.status) && job.status !== 'queued') {
          job.status = 'queued';
          job.progress = 0;
        }
        this.jobs.set(job.id, job);
        this.order.push(job.id);
      }
    } catch (_) {
      /* no persisted queue yet, or it's corrupt — start fresh */
    }
  }

  _persist() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const data = { jobs: this.order.map((id) => this.jobs.get(id)).filter(Boolean) };
    const tmp = this._queuePath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, this._queuePath());
  }

  list() {
    return this.order.map((id) => this.jobs.get(id)).filter(Boolean);
  }

  get(id) {
    return this.jobs.get(id);
  }

  enqueue(spec) {
    const id = spec.id || crypto.randomBytes(8).toString('hex');
    const job = Object.assign(
      {
        url: null,
        meta: null,
        formatId: 'best',
        audioOnly: false,
        audioBitrate: null,
        trim: null,
        subs: [],
        status: 'queued',
        progress: 0,
        speed: null,
        eta: null,
        error: null,
        filePath: null,
        createdAt: new Date().toISOString()
      },
      spec,
      { id }
    );
    this.jobs.set(id, job);
    this.order.push(id);
    this._persist();
    this._emitUpdate(job);
    this._pump();
    return id;
  }

  enqueueBatch(urls, defaults = {}) {
    return urls.map((url) => this.enqueue(Object.assign({}, defaults, { url })));
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return;
    const active = this.active.get(id);
    if (active) active.controller.abort();
    if (ACTIVE_STATUSES.has(job.status)) {
      job.status = 'error';
      job.error = 'Cancelled';
    }
    this._persist();
    this._emitUpdate(job);
    this._pump();
  }

  retry(id) {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'error') return;
    job.status = 'queued';
    job.error = null;
    job.progress = 0;
    this._persist();
    this._emitUpdate(job);
    this._pump();
  }

  removeJob(id) {
    const active = this.active.get(id);
    if (active) active.controller.abort();
    const idx = this.order.indexOf(id);
    if (idx >= 0) this.order.splice(idx, 1);
    this.jobs.delete(id);
    this._persist();
  }

  setConcurrency(n) {
    this.concurrency = Math.max(1, Math.min(3, n));
    this._pump();
  }

  _emitUpdate(job) {
    this.emit('update', job);
  }

  _pump() {
    while (this.active.size < this.concurrency) {
      const next = this.order.map((id) => this.jobs.get(id)).find((j) => j && j.status === 'queued');
      if (!next) return;
      this._run(next);
    }
  }

  async _run(job) {
    const controller = new AbortController();
    this.active.set(job.id, { controller });
    job.status = 'downloading';
    job.progress = 0;
    job.error = null;
    this._persist();
    this._emitUpdate(job);
    try {
      await this.runner(job, {
        signal: controller.signal,
        onProgress: (patch) => {
          Object.assign(job, patch);
          this._persist();
          this._emitUpdate(job);
        }
      });
      if (job.status !== 'error') {
        job.status = 'done';
        job.progress = 100;
      }
    } catch (err) {
      job.status = 'error';
      job.error = (err && err.message) || String(err);
    } finally {
      this.active.delete(job.id);
      this._persist();
      this._emitUpdate(job);
      this._pump();
    }
  }
}

module.exports = { JobQueue };
