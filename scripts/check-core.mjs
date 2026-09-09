import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const forbiddenImports = /^(react(?:-dom)?|zustand|@xyflow\/react)$|(?:^|\/)(?:ui|state|store|storage|application)(?:\/|$)/
const forbiddenCalls = new Set(['Date.now', 'Math.random', 'setTimeout', 'setInterval', 'requestAnimationFrame'])
const failures = []
function visitDirectory(directory) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) visitDirectory(filename)
    else if (/\.tsx?$/.test(filename) && !/\.test\.tsx?$/.test(filename)) {
      const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
      function visit(node) {
        let reason
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && forbiddenImports.test(node.moduleSpecifier.text)) reason = `forbidden dependency ${node.moduleSpecifier.text}`
        if (ts.isCallExpression(node) && forbiddenCalls.has(node.expression.getText(source))) reason = `nondeterministic call ${node.expression.getText(source)}`
        if (reason) failures.push(`${filename}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${reason}`)
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
}
visitDirectory('src/core')
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1 }
else console.log('Core boundaries and virtual-time calls verified.')
