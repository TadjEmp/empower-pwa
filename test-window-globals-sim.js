// Garde-fou : un `const X = ...` global n'est PAS une propriété de window. Tout module qui teste `window.X` doit
// donc voir X exposé (`window.X = X`), sinon la branche est silencieusement morte (Kit, mandats, toasts, coches du Coach).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'js'), fichiers = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const src = Object.fromEntries(fichiers.map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
const tout = Object.values(src).join('\n');
const consts = new Set();
Object.values(src).forEach(s => { for (const m of s.matchAll(/^const ([A-Z][A-Za-z0-9_]*)\s*=/gm)) consts.add(m[1]); });
const utilises = new Set([...tout.matchAll(/window\.([A-Z][A-Za-z0-9_]*)/g)].map(m => m[1]));
let ko = 0;
for (const n of [...utilises].sort()) {
  if (!consts.has(n)) continue;                                    // défini autrement (window.X = … ou IIFE assignée)
  const expose = new RegExp('window\\.' + n + '\\s*=[^=]').test(tout) || new RegExp('window\\[[\'"]' + n + '[\'"]\\]\\s*=').test(tout);
  if (!expose) { ko++; console.log('  KO  const ' + n + ' testé via window.' + n + ' mais jamais exposé sur window'); }
}
// DrawerMenu et SidebarToggle : gardes `if (window.X)` connues, laissées telles quelles (décision de ne pas changer le démarrage) : listées ici pour mémoire.
console.log(ko ? ko + ' KO' : 'OK : tout const testé via window est exposé');
process.exit(ko ? 1 : 0);
