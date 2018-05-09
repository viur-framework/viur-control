'use strict';
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

const fs = require('fs');
const path = require('path');

export const docDummy = "1";

function generate(projectSpecPath: string, force: boolean = false) {
  if (fs.existsSync(projectSpecPath) && !force) {
    return;
  }
}
