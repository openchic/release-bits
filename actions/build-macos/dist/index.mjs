import { w as within, p as plist, r as readBlocks, a as run, b as readProfile, c as profileData, d as withIdentity, s as setFailed, t as takeCredentials, e as setOutput, g as getInput, f as saveState } from './credentials.mjs';
import { realpathSync, existsSync, readdirSync, readFileSync, statSync, lstatSync, copyFileSync, writeFileSync, chmodSync, renameSync, mkdirSync, symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { relative, join, basename, resolve, dirname, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import 'os';
import 'crypto';
import 'fs';
import 'path';
import 'http';
import 'https';
import 'net';
import 'tls';
import 'events';
import 'assert';
import 'util';
import 'node:assert';
import 'node:net';
import 'node:http';
import 'node:stream';
import 'node:buffer';
import 'node:querystring';
import 'node:events';
import 'node:diagnostics_channel';
import 'node:tls';
import 'node:zlib';
import 'node:perf_hooks';
import 'node:util/types';
import 'node:worker_threads';
import 'node:http2';
import 'node:url';
import 'node:async_hooks';
import 'node:console';
import 'node:dns';
import 'string_decoder';
import 'child_process';
import 'timers';
import 'node:child_process';

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BUMPS = ['major', 'minor', 'patch'];
function parts(version) {
    const match = VERSION.exec(version.trim());
    if (!match)
        throw new Error('version must use X.Y.Z format');
    return match.slice(1).map(BigInt);
}
function effectiveVersion(version, kind = '') {
    const values = parts(version);
    if (!kind)
        return values.join('.');
    const index = BUMPS.indexOf(kind);
    if (index < 0)
        throw new Error('version-type must be major, minor or patch');
    values[index] += 1n;
    return values.fill(0n, index + 1).join('.');
}

const MACH_HEADERS = new Set(['feedface', 'cefaedfe', 'feedfacf', 'cffaedfe',
    'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']);
function isMachCode(path) {
    let magic = '';
    readBlocks(path, 4, (bytes) => { magic = bytes.toString('hex'); return false; });
    if (!MACH_HEADERS.has(magic))
        return false;
    // Fat archives and Java class resources can also carry the Universal magic.
    const description = run('/usr/bin/file', ['-b', path]).toString();
    return /Mach-O.*(?:executable|shared library|bundle|kext|dynamic linker)/i.test(description);
}
/** Enumerate physical code once, in the order required for sealing nested bundles. */
function components(app) {
    const result = [];
    const root = realpathSync(app);
    const owned = new Set();
    function bundle(path, content, infoPath, version) {
        const info = plist(readFileSync(within(root, infoPath)));
        const name = info.CFBundleExecutable;
        if (!name && info.CFBundlePackageType !== 'KEXT')
            return undefined; // resource-only bundle
        const id = info.CFBundleIdentifier;
        if (typeof id !== 'string' || !id)
            throw new Error('Missing CFBundleIdentifier in ' + infoPath);
        let binary;
        if (name !== undefined) {
            if (typeof name !== 'string' || !name || basename(name) !== name)
                throw new Error('Invalid executable in ' + infoPath);
            const location = basename(content) === 'Contents' ? join(content, 'MacOS', name) : join(content, name);
            binary = within(content, location);
            owned.add(binary);
        }
        return { path, binary, bundleId: id, frameworkVersion: version,
            profilePath: path.endsWith('.framework') ? undefined : join(content, 'embedded.provisionprofile') };
    }
    function walk(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isSymbolicLink()) {
                within(root, path);
                continue;
            }
            if (entry.isDirectory())
                visit(path);
            else if (entry.isFile() && !owned.has(path) && isMachCode(path))
                result.push({ path, binary: path });
        }
    }
    function visit(path) {
        const versions = join(path, 'Versions');
        if (path.endsWith('.framework') && existsSync(versions)) {
            within(root, versions);
            for (const entry of readdirSync(path, { withFileTypes: true })) {
                if (entry.isSymbolicLink())
                    within(root, join(path, entry.name));
            }
            for (const entry of readdirSync(versions, { withFileTypes: true })) {
                const dir = join(versions, entry.name);
                if (entry.isSymbolicLink()) {
                    within(root, dir);
                    continue;
                }
                if (!entry.isDirectory())
                    continue;
                const unit = bundle(path, dir, join(dir, 'Resources/Info.plist'), entry.name);
                walk(dir);
                if (unit)
                    result.push(unit);
            }
            return;
        }
        const contents = join(path, 'Contents');
        let unit;
        if (existsSync(join(contents, 'Info.plist'))) {
            unit = bundle(path, contents, join(contents, 'Info.plist'));
        }
        else if (path.endsWith('.framework')) {
            const info = [join(path, 'Resources/Info.plist'), join(path, 'Info.plist')].find(existsSync);
            if (!info)
                throw new Error('Missing framework Info.plist: ' + path);
            unit = bundle(path, path, info);
        }
        else if (/\.(app|appex|xpc|bundle|plugin|systemextension|dext|kext)$/i.test(path)
            && existsSync(join(path, 'Info.plist'))) {
            unit = bundle(path, path, join(path, 'Info.plist'));
        }
        walk(path);
        if (unit)
            result.push(unit);
    }
    visit(root);
    if (result.at(-1)?.path !== root)
        throw new Error('Missing executable for ' + relative(root, app));
    return result;
}

function targetSettings(tool, args) {
    const rows = JSON.parse(tool('/usr/bin/xcodebuild', [...args, '-showBuildSettings', '-json']).toString());
    if (rows.some((row) => row.error))
        throw new Error('Xcode could not read build settings: ' + rows.find((row) => row.error)?.error);
    return rows.map((r) => r.buildSettings);
}
function workspaceMembers(path) {
    const members = [
        'import json, os, sys, xml.etree.ElementTree as ET',
        'base, xml = sys.argv[1:]',
        'def walk(node, parent):',
        '    for ref in node:',
        '        kind, _, name = ref.get("location", "group:").partition(":")',
        '        path = os.path.realpath(os.path.join(base if kind == "container" else parent, name))',
        '        if ref.tag == "FileRef": yield path',
        '        if ref.tag == "Group": yield from walk(ref, path)',
        'print(json.dumps(list(walk(ET.parse(xml).getroot(), base))))',
    ].join('\n');
    return JSON.parse(run('/usr/bin/python3', ['-I', '-c', members, dirname(path),
        join(path, 'contents.xcworkspacedata')]).toString());
}
// Resolve project references from the selected workspace and PBX groups. Scheme
// settings alone can omit implicit dependencies such as embedded extension targets.
function projects(entry) {
    const found = new Set();
    const visited = new Set();
    function visit(input) {
        if (!existsSync(input))
            return;
        const path = realpathSync(input);
        if (visited.has(path))
            return;
        visited.add(path);
        if (extname(path) === '.xcworkspace') {
            workspaceMembers(path).forEach(visit);
            return;
        }
        if (extname(path) !== '.xcodeproj')
            return;
        found.add(path);
        const data = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(path, 'project.pbxproj')]).toString());
        const base = dirname(path);
        function group(key, parent) {
            const item = data.objects[key];
            if (!item)
                return;
            const location = resolve(item.sourceTree === 'SOURCE_ROOT' ? base : parent, item.path || '');
            if (item.isa === 'PBXFileReference' && item.path?.endsWith('.xcodeproj'))
                visit(location);
            if (item.children)
                for (const child of item.children)
                    group(child, location);
        }
        group(data.objects[data.rootObject].mainGroup, base);
    }
    visit(entry);
    return [...found];
}
function componentKey(unit) {
    return [unit.bundleId ?? '', basename(unit.path)].join('/');
}
function resolveComponentSettings(root, entry, units, initial, configuration, overrides, tool) {
    const targets = new Map();
    if (!units.length)
        return targets;
    function matches(unit, settings) {
        return settings.FULL_PRODUCT_NAME === basename(unit.path)
            && (!unit.bundleId || settings.PRODUCT_BUNDLE_IDENTIFIER === unit.bundleId);
    }
    let rows = initial;
    if (units.some((unit) => !rows.some((s) => matches(unit, s)))) {
        rows = [...initial];
        for (const project of projects(entry)) {
            rows.push(...targetSettings(tool, ['-project', project, '-alltargets', '-configuration', configuration,
                '-sdk', 'macosx', ...overrides]));
        }
    }
    for (const unit of units) {
        const matching = rows.filter((s) => matches(unit, s));
        if (!matching.length)
            continue; // A vendored binary may have its own signed entitlements.
        const owners = new Set(matching.map((s) => s.PROJECT_FILE_PATH + ':' + s.TARGET_NAME));
        if (owners.size > 1)
            throw new Error('Ambiguous signing target for ' + unit.path);
        const settings = matching[0];
        const file = settings.CODE_SIGN_ENTITLEMENTS;
        const permissions = file ? plist(readFileSync(within(root, resolve(settings.SRCROOT, file)))) : {};
        targets.set(componentKey(unit), { settings, permissions });
    }
    return targets;
}

const ARCHS = { universal: ['arm64', 'x86_64'], intel: ['x86_64'], 'apple-silicon': ['arm64'] };
const ignored = new Set(['Pods', 'Carthage', 'node_modules', 'DerivedData', 'build', 'SourcePackages', 'vendor']);
function architectures(get) {
    const keys = Object.keys(ARCHS);
    const specified = keys.filter((key) => get(key) !== '');
    if (!specified.length)
        return ['universal'];
    for (const key of specified) {
        if (!['true', 'false'].includes(get(key)))
            throw new Error(key + ' must be true or false');
    }
    const selected = specified.filter((key) => get(key) === 'true');
    if (!selected.length)
        throw new Error('Select at least one architecture');
    return selected;
}
function unique(candidates, input) {
    if (candidates.length !== 1) {
        throw new Error('Specify ' + input + '. Candidates: ' + (candidates.join(', ') || '(none)'));
    }
    return candidates[0];
}
function findProject(root, override) {
    const types = ['.xcodeproj', '.xcworkspace'];
    if (override) {
        const path = within(root, resolve(root, override));
        if (!types.includes(extname(path)) || !statSync(path).isDirectory())
            throw new Error('Invalid project-path');
        return path;
    }
    const candidates = new Set();
    function visit(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith('.') || ignored.has(entry.name))
                continue;
            const path = join(dir, entry.name);
            if (types.includes(extname(path)))
                candidates.add(path);
            else
                visit(path);
        }
    }
    visit(realpathSync(root));
    // Resolve workspace members, including FileRefs relative to nested Xcode groups.
    for (const path of [...candidates].filter((p) => p.endsWith('.xcworkspace'))) {
        for (const member of workspaceMembers(path))
            candidates.delete(member);
    }
    return unique([...candidates].sort(), 'project-path');
}
function apps(rows) {
    return rows.filter((s) => s.PRODUCT_TYPE === 'com.apple.product-type.application'
        && (s.SUPPORTED_PLATFORMS || s.PLATFORM_NAME || '').split(/\s+/).includes('macosx'));
}
function schemeArgs(root, inputs, tool = run, derived) {
    const path = findProject(root, inputs.project);
    const kind = path.endsWith('.xcworkspace') ? 'workspace' : 'project';
    const prefix = ['-' + kind, path];
    let scheme = inputs.scheme;
    if (!scheme) {
        const listing = JSON.parse(tool('/usr/bin/xcodebuild', [...prefix, '-list', '-json']).toString());
        const schemes = listing[kind].schemes ?? [];
        const candidates = [];
        const failures = [];
        for (const name of schemes) {
            try {
                const settings = targetSettings(tool, [...prefix, '-scheme', name, '-configuration',
                    inputs.configuration, ...(derived ? ['-derivedDataPath', derived] : [])]);
                if (apps(settings).length)
                    candidates.push(name);
            }
            catch (error) {
                failures.push(name + ': ' + (error instanceof Error ? error.message : String(error)));
            }
        }
        if (!candidates.length && failures.length) {
            throw new Error('Specify scheme. No usable macOS App scheme found. Probe failures:\n' + failures.join('\n'));
        }
        scheme = unique(candidates, 'scheme');
        if (failures.length)
            console.warn('Could not read build settings for some schemes:\n' + failures.join('\n'));
    }
    return [...prefix, '-scheme', scheme, '-configuration', inputs.configuration, '-destination', 'generic/platform=macOS'];
}
function mainApp(rows, name) {
    const candidates = apps(rows).filter((s) => !name || s.FULL_PRODUCT_NAME === name + '.app');
    unique(candidates.map((s) => s.FULL_PRODUCT_NAME), 'app-name');
    return candidates[0];
}
/** Resolve the version once for every architecture in this invocation. */
function resolveVersion(version, kind, projectVersion) {
    if (!kind) {
        if (!version)
            throw new Error('Specify version or version-type');
        if (!/^\d+(?:\.\d+){0,2}$/.test(version))
            throw new Error('Invalid version: expected one to three numeric components');
        return version;
    }
    if (!BUMPS.includes(kind))
        throw new Error('version-type must be major, minor or patch');
    if (version)
        return effectiveVersion(version, kind);
    const base = projectVersion();
    if (!base)
        throw new Error('Missing MARKETING_VERSION for the selected app');
    try {
        return effectiveVersion(base, kind);
    }
    catch {
        throw new Error('MARKETING_VERSION must use X.Y.Z format');
    }
}
function projectVersion(args, name, tool = run) {
    return mainApp(targetSettings(tool, args), name).MARKETING_VERSION;
}
function build(root, work, base, mode, inputs, tool = run) {
    const args = [...base, '-derivedDataPath', join(work, mode), 'ONLY_ACTIVE_ARCH=NO',
        'ARCHS=' + ARCHS[mode].join(' '), 'CODE_SIGNING_ALLOWED=NO'];
    args.push('MARKETING_VERSION=' + inputs.version, 'CURRENT_PROJECT_VERSION=' + inputs.version);
    const rows = targetSettings(tool, args);
    const settings = mainApp(rows, inputs.name);
    const product = settings.FULL_PRODUCT_NAME;
    tool('/usr/bin/xcodebuild', [...args, '-quiet', 'build']);
    const path = join(settings.TARGET_BUILD_DIR, product);
    const info = plist(readFileSync(join(path, 'Contents/Info.plist')));
    const { CFBundleShortVersionString: version, CFBundleIdentifier: bundleId, CFBundleExecutable: executable } = info;
    if (typeof version !== 'string' || !/^\d+(?:\.\d+){0,2}$/.test(version))
        throw new Error('Invalid app version');
    if (version !== inputs.version || info.CFBundleVersion !== version)
        throw new Error('Version override missing from built app');
    if (typeof bundleId !== 'string' || !bundleId || typeof executable !== 'string')
        throw new Error('Missing app metadata');
    const binary = within(path, join(path, 'Contents/MacOS', executable));
    const slices = tool('/usr/bin/lipo', ['-archs', binary]).toString().trim().split(/\s+/);
    if (slices.sort().join() !== [...ARCHS[mode]].sort().join())
        throw new Error('Unexpected executable architectures');
    const file = inputs.entitlements ? resolve(root, inputs.entitlements)
        : settings.CODE_SIGN_ENTITLEMENTS && resolve(settings.SRCROOT, settings.CODE_SIGN_ENTITLEMENTS);
    if (file && !existsSync(file))
        throw new Error('Missing entitlements file: ' + file);
    const componentTargets = resolveComponentSettings(root, base[1], components(path).slice(0, -1), rows, inputs.configuration, args.filter((arg) => /^[A-Z_]+=/.test(arg)), tool);
    return { mode, path, componentTargets, name: basename(product, '.app'), version, bundleId, settings,
        permissions: file ? plist(readFileSync(within(root, file))) : {} };
}

function permits(rule, value) {
    if (Array.isArray(rule)) {
        return (Array.isArray(value) ? value : [value]).every((v) => rule.some((r) => permits(r, v)));
    }
    if (typeof rule === 'string' && rule.endsWith('*') && typeof value === 'string') {
        return value.startsWith(rule.slice(0, -1));
    }
    return isDeepStrictEqual(rule, value);
}
function expand(value, vars) {
    if (Array.isArray(value))
        return value.map((v) => expand(v, vars));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v, vars)]));
    }
    if (typeof value !== 'string')
        return value;
    return value.replace(/\$\(([^)]+)\)|\$\{([^}]+)\}/g, (_, a, b) => {
        const replacement = vars[a ?? b];
        if (typeof replacement !== 'string' || replacement.includes('$'))
            throw new Error('Unresolved entitlement variable: ' + (a ?? b));
        return replacement;
    });
}
function signingPermissions(app, identity, profile) {
    const appKey = 'com.apple.application-identifier';
    const teamKey = 'com.apple.developer.team-identifier';
    let prefix = identity.team;
    if (profile) {
        if (!(Date.parse(profile.ExpirationDate) > Date.now()) || !profile.Platform?.includes('OSX')
            || !profile.ProvisionsAllDevices || profile.ProvisionedDevices
            || profile.Entitlements?.['com.apple.security.get-task-allow'] || profile.Entitlements?.['get-task-allow']) {
            throw new Error('Expected a current macOS Developer ID distribution profile');
        }
        if (!isDeepStrictEqual(profile.TeamIdentifier, [identity.team]) || profile.ApplicationIdentifierPrefix?.length !== 1) {
            throw new Error('Profile team or application prefix mismatch');
        }
        if (!profile.DeveloperCertificates?.some((der) => createHash('sha1').update(Buffer.from(der, 'base64'))
            .digest('hex').toUpperCase() === identity.fingerprint))
            throw new Error('Profile does not authorize signing certificate');
        prefix = profile.ApplicationIdentifierPrefix[0];
    }
    const identifier = prefix + '.' + app.bundleId;
    const vars = { ...app.settings, AppIdentifierPrefix: prefix + '.', TeamIdentifierPrefix: identity.team + '.',
        PRODUCT_BUNDLE_IDENTIFIER: app.bundleId };
    const values = Object.fromEntries(Object.entries(app.permissions)
        .map(([key, v]) => [key, expand(v, vars)]));
    if (profile) {
        for (const [key, value] of [[appKey, identifier], [teamKey, identity.team]]) {
            if (key in values && values[key] !== value)
                throw new Error('Conflicting entitlement: ' + key);
            values[key] = value;
        }
    }
    for (const [key, value] of Object.entries(values)) {
        if (['get-task-allow', 'com.apple.security.get-task-allow'].includes(key) && value) {
            throw new Error('Debugging entitlement cannot be distributed');
        }
        const restricted = [appKey, 'keychain-access-groups', 'aps-environment'].includes(key)
            || key.startsWith('com.apple.developer.');
        const allowed = profile?.Entitlements ?? {};
        if ((restricted || key in allowed) && !permits(allowed[key], value)) {
            throw new Error('Profile does not authorize entitlement: ' + key);
        }
    }
    return values;
}

function selectSlices(binary, mode, temp, tool) {
    const actual = tool('/usr/bin/lipo', ['-archs', binary]).toString().trim().split(/\s+/);
    const required = ARCHS[mode];
    const missing = required.filter((arch) => !actual.includes(arch));
    if (missing.length)
        throw new Error('Missing architecture ' + missing.join(', ') + ' in ' + binary);
    if (required.length === actual.length)
        return;
    const select = required.length === 1 ? ['-thin', required[0]] : required.flatMap((arch) => ['-extract', arch]);
    tool('/usr/bin/lipo', [binary, ...select, '-output', temp]);
    chmodSync(temp, statSync(binary).mode & 0o7777);
    renameSync(temp, binary);
}
function existingPermissions(unit, architectures, tool) {
    if (!unit.binary)
        return {};
    const binary = unit.binary;
    const permissions = architectures.map((arch) => {
        const commands = tool('/usr/bin/otool', ['-arch', arch, '-l', binary]).toString();
        if (!/\bcmd LC_CODE_SIGNATURE\b/.test(commands))
            return {};
        const bytes = tool('/usr/bin/codesign', ['-d', '--arch', arch, '--entitlements', '-', '--xml', binary], { quiet: true });
        return bytes.length ? plist(bytes) : {};
    });
    if (!permissions.every((rights) => isDeepStrictEqual(rights, permissions[0]))) {
        throw new Error('Prebuilt entitlements differ between selected architectures');
    }
    return permissions[0];
}
/** Sign each physical framework version, executable and bundle before its enclosing bundle. */
function signApp(app, product, work, identity, mainProfile, tool = run) {
    const units = components(app);
    for (const unit of units) {
        const main = unit === units.at(-1);
        const version = unit.frameworkVersion ? ['--bundle-version', unit.frameworkVersion] : [];
        try {
            const target = main ? product : product.componentTargets?.get(componentKey(unit));
            if (unit.binary)
                selectSlices(unit.binary, product.mode, join(work, 'selected-slices'), tool);
            const permissions = target?.permissions ?? existingPermissions(unit, ARCHS[product.mode], tool);
            const bundleId = unit.bundleId || target?.settings.PRODUCT_BUNDLE_IDENTIFIER || basename(unit.path);
            const location = unit.profilePath;
            const supplied = main ? mainProfile : undefined;
            if (location && lstatSync(location, { throwIfNoEntry: false })?.isSymbolicLink()) {
                throw new Error('Profile destination must be a regular file');
            }
            const profile = supplied || (location && existsSync(location) ? readProfile(location, tool) : undefined);
            const rights = signingPermissions({ bundleId, permissions, settings: target?.settings ?? {} }, identity, profile?.profile);
            if (location && supplied)
                copyFileSync(supplied.path, location);
            const args = ['--force', '--options', 'runtime', '--keychain', identity.keychain, '--sign',
                identity.fingerprint, '--timestamp', ...version];
            if (Object.keys(rights).length) {
                const file = join(work, 'component.entitlements');
                writeFileSync(file, tool('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], { input: JSON.stringify(rights) }), { mode: 0o600 });
                args.push('--entitlements', file);
            }
            tool('/usr/bin/codesign', [...args, unit.path]);
            tool('/usr/bin/codesign', ['--verify', '--strict', '--all-architectures', ...version,
                '-R=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists', unit.path]);
            if (Object.keys(rights).length) {
                const signed = plist(tool('/usr/bin/codesign', ['-d', '--entitlements', '-', '--xml', ...version, unit.path]));
                if (!isDeepStrictEqual(signed, rights))
                    throw new Error('Signed entitlements differ');
            }
        }
        catch (error) {
            throw new Error((relative(realpathSync(app), unit.path) || basename(app)) + ': ' + (error instanceof Error ? error.message : String(error)));
        }
    }
    tool('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--all-architectures', app]);
}

function notarize(path, keyFile, credentials, tool = run) {
    const auth = ['--key', keyFile, '--key-id', credentials.keyId, '--issuer', credentials.issuer, '--output-format', 'json'];
    const result = JSON.parse(tool('/usr/bin/xcrun', ['notarytool', 'submit', path, ...auth]).toString());
    if (typeof result.id !== 'string' || !result.id)
        throw new Error('Missing notarization submission ID');
    console.log('Notarization submission ' + result.id);
    const outcome = JSON.parse(tool('/usr/bin/xcrun', ['notarytool', 'wait', result.id, '--timeout', '1h', ...auth]).toString());
    if (outcome.status !== 'Accepted')
        throw new Error('Notarization ' + result.id + ': ' + outcome.status);
    tool('/usr/bin/xcrun', ['stapler', 'staple', path]);
    tool('/usr/bin/xcrun', ['stapler', 'validate', path]);
    tool('/usr/sbin/spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', path]);
}
function describe(mode, path) {
    const hash = createHash('sha256');
    readBlocks(path, 1024 * 1024, (bytes) => { hash.update(bytes); return true; });
    return { architecture: mode, path, filename: basename(path), sha256: hash.digest('hex'), size: statSync(path).size };
}
function createSignedImage(product, work, output, identity, mainProfile, tool = run) {
    const staging = join(work, 'stage-' + product.mode);
    mkdirSync(staging);
    const app = join(staging, basename(product.path));
    tool('/usr/bin/ditto', [product.path, app]);
    signApp(app, product, work, identity, mainProfile, tool);
    symlinkSync('/Applications', join(staging, 'Applications'));
    const suffix = product.mode === 'universal' ? '' : '-' + product.mode;
    const dmg = join(output, product.name + '-' + product.version + suffix + '.dmg');
    tool('/usr/bin/hdiutil', ['create', '-volname', product.name, '-srcfolder', staging, '-format', 'UDZO', dmg]);
    tool('/usr/bin/codesign', ['--force', '--keychain', identity.keychain, '--sign', identity.fingerprint, '--timestamp', dmg]);
    return dmg;
}

function phase(description, action) {
    console.log(description);
    try {
        return action();
    }
    catch (error) {
        throw new Error(description + ': ' + (error instanceof Error ? error.message : String(error)));
    }
}
function prepare(root, temp, options, modes, credentials, remember) {
    const work = mkdtempSync(join(temp, 'build-macos-'));
    const output = join(work, 'packages');
    const privateDir = join(work, 'private');
    try {
        remember(work);
        mkdirSync(privateDir, { mode: 0o700 });
        mkdirSync(output);
        const derived = join(privateDir, 'discovery');
        const args = schemeArgs(root, options, undefined, derived);
        const version = resolveVersion(options.version, options.versionType, () => projectVersion([...args, '-derivedDataPath', derived], options.name));
        const resolved = { ...options, version };
        const apps = modes.map((mode) => phase('Build ' + mode, () => build(root, privateDir, args, mode, resolved)));
        const profile = profileData(privateDir, credentials.profile);
        const images = withIdentity(privateDir, credentials, (identity) => apps.map((app) => ({
            mode: app.mode,
            path: phase('Sign ' + app.mode, () => createSignedImage(app, privateDir, output, identity, profile)),
        })));
        const keyFile = join(privateDir, 'notary.p8');
        writeFileSync(keyFile, credentials.key, { mode: 0o600, flag: 'wx' });
        const packages = images.map(({ mode, path }) => phase('Notarize ' + mode, () => {
            notarize(path, keyFile, credentials);
            return describe(mode, path);
        }));
        rmSync(privateDir, { recursive: true });
        return { version, packages };
    }
    catch (error) {
        rmSync(work, { recursive: true, force: true });
        throw error;
    }
}

function main() {
    if (process.platform !== 'darwin')
        throw new Error('build-macos requires a macOS runner');
    const get = getInput;
    const modes = architectures(get);
    const credentials = takeCredentials();
    const root = process.env.GITHUB_WORKSPACE;
    const temp = process.env.RUNNER_TEMP;
    if (!root || !temp)
        throw new Error('Missing GITHUB_WORKSPACE or RUNNER_TEMP');
    const { version, packages } = prepare(root, temp, { project: get('project-path'), scheme: get('scheme'),
        name: get('app-name'), version: get('version'), versionType: get('version-type'), configuration: get('build-mode') || 'Release',
        entitlements: get('entitlements-path') }, modes, credentials, (work) => saveState('work', work));
    setOutput('packages-json', packages);
    setOutput('version', version);
}
try {
    main();
}
catch (error) {
    setFailed(error instanceof Error ? error.message : String(error));
}
