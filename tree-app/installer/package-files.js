'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..', '..');
const runtimeFiles = [
  'index.html', 'app.js', 'release-check.js', 'map.js', 'styles.css', 'version.js',
  'favicon.svg', 'welcome-pattern.svg', 'server.js', 'Kinship Atlas.exe',
  'THIRD-PARTY-NOTICES.md', 'data/world-data.js', 'launcher/kinship-atlas.ico',
  'flags/LICENSE', 'flags/README.md'
];

function packageFiles(trackedFiles) {
  return [
    ...runtimeFiles.map((name) => `tree-app/${name}`),
    ...trackedFiles.filter((name) => /^tree-app\/flags\/4x3\/[^/\\]+\.svg$/.test(name)),
    'LICENSE'
  ];
}

function generate() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'tree-app', 'version.js'), 'utf8'), context);
  const releases = context.window.KINSHIP_VERSION.releases;
  const version = releases[0].version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version.');
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = packageFiles(tracked);
  const destination = path.join(__dirname, 'generated');
  fs.mkdirSync(destination, { recursive: true });
  const lines = [];
  const checks = [];
  for (const name of files) {
    const source = path.join(root, name);
    if (!fs.lstatSync(source).isFile()) throw new Error(`Missing or linked package file: ${name}`);
    for (let parent = path.dirname(source); parent !== root; parent = path.dirname(parent)) {
      if (fs.lstatSync(parent).isSymbolicLink()) throw new Error(`Linked package directory: ${name}`);
    }
    const relative = name.startsWith('tree-app/') ? name.slice(9) : name;
    const directory = path.dirname(relative).replace(/\//g, '\\');
    const target = directory === '.' ? '{app}' : `{app}\\${directory}`;
    if (source.includes('"') || target.includes('"')) throw new Error('Invalid package path.');
    lines.push(`Source: "${source}"; DestDir: "${target}"; Flags: ignoreversion`);
    const destinationFile = `${target}\\${path.basename(relative)}`.replace(/'/g, "''");
    checks.push(`  if not SafeDestination(ExpandConstant('${destinationFile}')) then begin Result := 'Application files and folders must not be junctions or symbolic links.'; Exit; end;`);
  }
  fs.writeFileSync(path.join(destination, 'files.iss'), lines.join('\r\n') + '\r\n');
  fs.writeFileSync(path.join(destination, 'checks.iss'), checks.join('\r\n') + '\r\n');
  fs.writeFileSync(path.join(destination, 'version.iss'),
    `#define AppVersion "${version}"\r\n#define AllowedVersions "${releases.map((release) => release.version).join('|')}"\r\n`);
  return { version, files };
}

if (require.main === module) console.log(JSON.stringify(generate()));
module.exports = { packageFiles };
