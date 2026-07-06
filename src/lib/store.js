'use strict';
/**
 * Tiny BOM-free JSON stores for settings.json and history.json (userData).
 * Written exclusively via Node's fs — never PowerShell — so JSON.parse never
 * chokes on a stray UTF-8 BOM.
 */
const fs = require('fs');
const path = require('path');

const SETTINGS_DEFAULTS = {
  outDir: null, // resolved by the caller (e.g. app.getPath('videos')) when null
  template: '%(title)s [%(id)s].%(ext)s',
  defaultQuality: 'best',
  concurrency: 1,
  subLangsDefault: ['en']
};

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

class Settings {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'settings.json');
    this.data = Object.assign({}, SETTINGS_DEFAULTS, readJson(this.file, {}));
  }
  get() {
    return this.data;
  }
  set(patch) {
    this.data = Object.assign({}, this.data, patch);
    writeJsonAtomic(this.file, this.data);
    return this.data;
  }
}

class History {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'history.json');
    this.items = readJson(this.file, []);
  }
  list() {
    return this.items;
  }
  add(entry) {
    this.items.unshift(entry);
    writeJsonAtomic(this.file, this.items);
    return entry;
  }
  clear() {
    this.items = [];
    writeJsonAtomic(this.file, this.items);
  }
}

module.exports = { Settings, History, SETTINGS_DEFAULTS, writeJsonAtomic, readJson };
