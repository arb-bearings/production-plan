const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'lib', 'recursive-delete.js'),
  path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'esm', 'lib', 'recursive-delete.js')
];

for (const filePath of targetFiles) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Pattern in CJS
    const cjsOld = `        const isSymlink = part.isSymbolicLink();
        if (isSymlink) {
            const linkPath = await _fs.promises.readlink(absolutePath);
            try {
                const stats = await _fs.promises.stat((0, _path.isAbsolute)(linkPath) ? linkPath : (0, _path.join)((0, _path.dirname)(absolutePath), linkPath));
                isDirectory = stats.isDirectory();
            } catch  {}
        }`;

    const cjsNew = `        let isSymlink = part.isSymbolicLink();
        if (isSymlink) {
            try {
                const linkPath = await _fs.promises.readlink(absolutePath);
                try {
                    const stats = await _fs.promises.stat((0, _path.isAbsolute)(linkPath) ? linkPath : (0, _path.join)((0, _path.dirname)(absolutePath), linkPath));
                    isDirectory = stats.isDirectory();
                } catch {}
            } catch (e) {
                isSymlink = false;
                try {
                    const stats = await _fs.promises.stat(absolutePath);
                    isDirectory = stats.isDirectory();
                } catch {}
            }
        }`;

    // Pattern in ESM
    const esmOld = `        const isSymlink = part.isSymbolicLink();
        if (isSymlink) {
            const linkPath = await promises.readlink(absolutePath);
            try {
                const stats = await promises.stat(isAbsolute(linkPath) ? linkPath : join(dirname(absolutePath), linkPath));
                isDirectory = stats.isDirectory();
            } catch  {}
        }`;

    const esmNew = `        let isSymlink = part.isSymbolicLink();
        if (isSymlink) {
            try {
                const linkPath = await promises.readlink(absolutePath);
                try {
                    const stats = await promises.stat(isAbsolute(linkPath) ? linkPath : join(dirname(absolutePath), linkPath));
                    isDirectory = stats.isDirectory();
                } catch {}
            } catch (e) {
                isSymlink = false;
                try {
                    const stats = await promises.stat(absolutePath);
                    isDirectory = stats.isDirectory();
                } catch {}
            }
        }`;

    if (content.includes(cjsOld)) {
      content = content.replace(cjsOld, cjsNew);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[patch-next] Patched CJS recursive-delete.js for OneDrive compatibility.`);
    } else if (content.includes(esmOld)) {
      content = content.replace(esmOld, esmNew);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[patch-next] Patched ESM recursive-delete.js for OneDrive compatibility.`);
    }
  }
}
