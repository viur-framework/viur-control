"use strict";

const fs = require('fs');
const path = require('path');

function generate(projectSpecPath, force=False) {
  if (fs.existsSync(projectSpecPath) && !force) {
    return;
  }


}
