'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('fs');
function generate(projectSpecPath, force = false) {
    if (fs.existsSync(projectSpecPath) && !force) {
        return;
    }
}
exports.generate = generate;
//# sourceMappingURL=readme_generator.js.map