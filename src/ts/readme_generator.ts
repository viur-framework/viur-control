'use strict';

const fs = require('fs');

export function generate(projectSpecPath: string, force: boolean = false) {
  if (fs.existsSync(projectSpecPath) && !force) {
    return;
  }
}
