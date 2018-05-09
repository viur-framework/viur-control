'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="node_modules/@types/electron-store/index.d.ts" />
const fs = require('fs');
const path = require('path');
exports.docDummy = "1";
function generate(projectSpecPath, force = false) {
    if (fs.existsSync(projectSpecPath) && !force) {
        return;
    }
}
//# sourceMappingURL=readme_generator.js.map