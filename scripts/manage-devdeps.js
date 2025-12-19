#!/usr/bin/env node

/**
 * Script to manage devDependencies for flywave.gl package during publish
 * 
 * Usage:
 * - Backup devDependencies: node manage-devdeps.js backup
 * - Restore devDependencies: node manage-devdeps.js restore
 * - Clear devDependencies: node manage-devdeps.js clear
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE_JSON_PATH = path.join(__dirname, '../@flywave/flywave.gl/package.json');
const BACKUP_PATH = path.join(__dirname, '../@flywave/flywave.gl/package.devdeps.backup');

function readPackageJson() {
  const content = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
  return JSON.parse(content);
}

function writePackageJson(data) {
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(data, null, 4) + '\n');
}

function backupDevDependencies() {
  const pkg = readPackageJson();
  
  if (pkg.devDependencies) {
    // Backup devDependencies to a file
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(pkg.devDependencies, null, 2));
    console.log('✅ Backed up devDependencies');
  } else {
    // Create empty backup file if no devDependencies
    fs.writeFileSync(BACKUP_PATH, '{}');
    console.log('ℹ️ No devDependencies to backup');
  }
}

function restoreDevDependencies() {
  if (!fs.existsSync(BACKUP_PATH)) {
    console.log('❌ No backup found');
    process.exit(1);
  }
  
  const pkg = readPackageJson();
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  
  pkg.devDependencies = backup;
  writePackageJson(pkg);
  
  // Remove backup file
  fs.unlinkSync(BACKUP_PATH);
  
  console.log('✅ Restored devDependencies');
}

function clearDevDependencies() {
  const pkg = readPackageJson();
  pkg.devDependencies = {};
  writePackageJson(pkg);
  console.log('✅ Cleared devDependencies');
}

// Main execution
const command = process.argv[2];

switch (command) {
  case 'backup':
    backupDevDependencies();
    break;
  case 'restore':
    restoreDevDependencies();
    break;
  case 'clear':
    clearDevDependencies();
    break;
  default:
    console.log('Usage: node manage-devdeps.js [backup|restore|clear]');
    process.exit(1);
}