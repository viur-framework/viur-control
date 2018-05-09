'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('fs');
const path = require('path');
exports.docDummy = "1";
function generate(projectSpecPath, force = false) {
    if (fs.existsSync(projectSpecPath) && !force) {
        return;
    }
}
