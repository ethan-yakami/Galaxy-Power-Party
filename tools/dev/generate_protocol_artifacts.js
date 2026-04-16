const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const PROTO_DIR = path.join(ROOT, 'proto');
const OUTPUTS = Object.freeze([
  {
    path: path.join(ROOT, 'src', 'core', 'shared', 'generated', 'protocol-manifest.json'),
    kind: 'manifest',
  },
  {
    path: path.join(ROOT, 'src', 'core', 'shared', 'generated', 'protocol-types.d.ts'),
    kind: 'dts',
  },
]);
const PROTO_FIELD_OVERRIDES = Object.freeze({
  string: 'string',
  bool: 'boolean',
  int32: 'integer',
  int64: 'integer',
  uint32: 'integer',
  uint64: 'integer',
  sint32: 'integer',
  sint64: 'integer',
  fixed32: 'integer',
  fixed64: 'integer',
  sfixed32: 'integer',
  sfixed64: 'integer',
  'google.protobuf.Struct': 'object',
});

function toCamelCase(value) {
  const safe = String(value || '').trim();
  return safe.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

function parseAnnotation(commentText, prefix) {
  const trimmed = String(commentText || '').trim();
  if (!trimmed.includes(prefix)) return null;
  const start = trimmed.indexOf(prefix);
  const raw = trimmed.slice(start + prefix.length).trim();
  if (!raw) return {};
  const attributes = {};
  for (const token of raw.split(/\s+/)) {
    const [key, value] = token.split('=');
    if (!key || value === undefined) continue;
    attributes[key.trim()] = value.trim();
  }
  return attributes;
}

function listProtoFiles() {
  return fs.readdirSync(PROTO_DIR)
    .filter((name) => name.endsWith('.proto'))
    .sort()
    .map((name) => path.join(PROTO_DIR, name));
}

function inferFieldType(protoType, repeated, overrideType) {
  const mapped = overrideType || PROTO_FIELD_OVERRIDES[protoType] || 'object';
  if (mapped === 'integer' && repeated) return 'integer_array';
  if (mapped === 'string' && repeated) return 'string_array';
  if (mapped === 'object' && repeated) return 'object_array';
  return mapped;
}

function normalizeFieldDescriptor(field, currentMessage) {
  return {
    name: toCamelCase(field.name),
    protoName: field.name,
    protoType: field.protoType,
    fieldNumber: field.fieldNumber,
    type: inferFieldType(field.protoType, field.repeated, field.typeOverride),
    required: field.required !== false,
    repeated: !!field.repeated,
    transitional: field.transitional || '',
    source: {
      file: currentMessage.source.file,
      line: field.line,
      message: currentMessage.name,
    },
  };
}

function parseProtoSource() {
  const files = listProtoFiles();
  const messages = [];
  const warnings = [];

  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath).split(path.sep).join('/');
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    let pendingMessageMeta = null;
    let pendingFieldMeta = null;
    let currentMessage = null;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNo = index + 1;

      const messageAnnotation = parseAnnotation(line, '@gpp-message');
      if (messageAnnotation) {
        pendingMessageMeta = messageAnnotation;
        continue;
      }

      const fieldAnnotation = parseAnnotation(line, '@gpp-field');
      if (fieldAnnotation && !/^\s*(repeated\s+)?[\w.]+\s+\w+\s*=/.test(line)) {
        pendingFieldMeta = fieldAnnotation;
        continue;
      }

      const messageMatch = line.match(/^\s*message\s+(\w+)\s*\{/);
      if (messageMatch) {
        currentMessage = {
          name: messageMatch[1],
          source: { file: rel, line: lineNo },
          annotations: pendingMessageMeta,
          fields: [],
        };
        pendingMessageMeta = null;
        continue;
      }

      if (currentMessage) {
        const fieldMatch = line.match(/^\s*(repeated\s+)?([\w.]+)\s+(\w+)\s*=\s*(\d+)\s*;\s*(?:\/\/\s*(.*))?$/);
        if (fieldMatch) {
          const inlineFieldMeta = parseAnnotation(fieldMatch[5], '@gpp-field') || {};
          const mergedFieldMeta = Object.assign({}, pendingFieldMeta || {}, inlineFieldMeta);
          currentMessage.fields.push(normalizeFieldDescriptor({
            repeated: !!fieldMatch[1],
            protoType: fieldMatch[2],
            name: fieldMatch[3],
            fieldNumber: Number(fieldMatch[4]),
            typeOverride: mergedFieldMeta.type,
            required: mergedFieldMeta.required === 'false' ? false : true,
            transitional: mergedFieldMeta.transitional || '',
            line: lineNo,
          }, currentMessage));
          pendingFieldMeta = null;
          continue;
        }

        if (/^\s*\}/.test(line)) {
          if (currentMessage.annotations && currentMessage.annotations.type) {
            messages.push({
              runtimeType: currentMessage.annotations.type,
              direction: currentMessage.annotations.direction || 'server_to_client',
              source: currentMessage.source,
              protoMessage: currentMessage.name,
              fields: currentMessage.fields,
            });
          } else if (currentMessage.name.endsWith('Payload')) {
            warnings.push(`proto message missing @gpp-message annotation: ${rel}:${currentMessage.source.line} ${currentMessage.name}`);
          }
          currentMessage = null;
          pendingFieldMeta = null;
        }
      }
    }
  }

  messages.sort((left, right) => left.runtimeType.localeCompare(right.runtimeType));
  return {
    version: 2,
    source: {
      kind: 'proto',
      directory: 'proto',
      files: files.map((filePath) => path.relative(ROOT, filePath).split(path.sep).join('/')),
    },
    messages,
    warnings,
  };
}

function lintProtoSource(manifest) {
  const seenTypes = new Set();
  const errors = [];
  for (const descriptor of manifest.messages) {
    if (!descriptor.runtimeType) {
      errors.push(`missing runtime type for ${descriptor.protoMessage}`);
      continue;
    }
    if (seenTypes.has(descriptor.runtimeType)) {
      errors.push(`duplicate runtime type "${descriptor.runtimeType}"`);
    }
    seenTypes.add(descriptor.runtimeType);
    for (const field of descriptor.fields) {
      if (!field.name) {
        errors.push(`missing field name in ${descriptor.runtimeType}`);
      }
      if (!field.type) {
        errors.push(`missing field type in ${descriptor.runtimeType}.${field.name}`);
      }
    }
  }
  return errors;
}

function maybeRunBufLint() {
  const result = spawnSync('buf', ['lint'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
  const stderr = String(result.stderr || '');
  const commandMissing = (result.error && ['ENOENT', 'EPERM'].includes(result.error.code))
    || /not recognized|not found|CommandNotFoundException|无法将“buf”项识别为/i.test(stderr);
  if (commandMissing) {
    return {
      skipped: true,
      stdout: '',
      stderr: 'buf not installed; skipped external lint',
    };
  }
  if (result.status !== 0) {
    throw new Error(`buf lint failed:\n${result.stdout || ''}\n${result.stderr || ''}`.trim());
  }
  return {
    skipped: false,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function renderManifest(manifest) {
  const payload = {
    version: manifest.version,
    source: manifest.source,
    messages: manifest.messages.map((message) => ({
      type: message.runtimeType,
      direction: message.direction,
      protoMessage: message.protoMessage,
      source: message.source,
      fields: message.fields,
    })),
    warnings: manifest.warnings,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function tsTypeForField(field) {
  switch (field.type) {
    case 'string':
      return 'string';
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'integer_array':
      return 'number[]';
    case 'string_array':
      return 'string[]';
    case 'string_or_number':
      return 'string | number';
    case 'object':
      return 'ProtocolObject';
    case 'object_array':
      return 'ProtocolObject[]';
    default:
      return 'unknown';
  }
}

function renderTypes(manifest) {
  const typeList = manifest.messages.map((item) => `'${item.runtimeType}'`).join(' | ');
  const lines = [];
  lines.push('// Generated by tools/dev/generate_protocol_artifacts.js');
  lines.push('// Source of truth: proto/*.proto');
  lines.push('');
  lines.push('export type ProtocolMessageType =');
  lines.push(`  ${typeList};`);
  lines.push('');
  lines.push("export type ProtocolDirection = 'client_to_server' | 'server_to_client';");
  lines.push('');
  lines.push('export type ProtocolObject = Record<string, unknown>;');
  lines.push('');
  lines.push('export interface ProtocolMeta {');
  lines.push('  protocolVersion?: string;');
  lines.push('  requestId?: string;');
  lines.push('  [key: string]: unknown;');
  lines.push('}');
  lines.push('');
  lines.push('export interface ProtocolFieldDescriptor {');
  lines.push('  name: string;');
  lines.push('  protoName: string;');
  lines.push('  protoType: string;');
  lines.push('  fieldNumber: number;');
  lines.push("  type: 'string' | 'integer' | 'boolean' | 'integer_array' | 'string_array' | 'string_or_number' | 'object' | 'object_array';");
  lines.push('  required: boolean;');
  lines.push('  repeated: boolean;');
  lines.push('  transitional: string;');
  lines.push('  source: { file: string; line: number; message: string };');
  lines.push('}');
  lines.push('');
  lines.push('export interface ProtocolMessageDescriptor<T extends ProtocolMessageType = ProtocolMessageType> {');
  lines.push('  type: T;');
  lines.push('  direction: ProtocolDirection;');
  lines.push('  protoMessage: string;');
  lines.push('  source: { file: string; line: number };');
  lines.push('  fields: ProtocolFieldDescriptor[];');
  lines.push('}');
  lines.push('');
  lines.push('export interface ProtocolPayloadByType {');
  for (const message of manifest.messages) {
    if (!message.fields.length) {
      lines.push(`  '${message.runtimeType}': Record<string, never>;`);
      continue;
    }
    lines.push(`  '${message.runtimeType}': {`);
    for (const field of message.fields) {
      const opt = field.required ? '' : '?';
      lines.push(`    ${field.name}${opt}: ${tsTypeForField(field)};`);
    }
    lines.push('  };');
  }
  lines.push('}');
  lines.push('');
  lines.push('export type ProtocolEnvelope<T extends ProtocolMessageType = ProtocolMessageType> = {');
  lines.push('  type: T;');
  lines.push('  payload: ProtocolPayloadByType[T];');
  lines.push('  meta?: ProtocolMeta;');
  lines.push('};');
  lines.push('');
  lines.push('export type ProtocolDirectionByType = {');
  for (const message of manifest.messages) {
    lines.push(`  '${message.runtimeType}': '${message.direction}';`);
  }
  lines.push('};');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function renderByKind(kind, manifest) {
  if (kind === 'manifest') return renderManifest(manifest);
  if (kind === 'dts') return renderTypes(manifest);
  throw new Error(`Unknown artifact kind: ${kind}`);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const manifest = parseProtoSource();
  const lintErrors = lintProtoSource(manifest);
  if (lintErrors.length > 0) {
    console.error('protocol source lint failed:');
    lintErrors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  const bufLint = maybeRunBufLint();
  if (!bufLint.skipped && !checkOnly && bufLint.stdout.trim()) {
    process.stdout.write(bufLint.stdout);
  }

  let dirtyCount = 0;

  for (const output of OUTPUTS) {
    const expected = renderByKind(output.kind, manifest);
    const current = readFileSafe(output.path);
    const rel = path.relative(ROOT, output.path).split(path.sep).join('/');

    if (checkOnly) {
      if (current !== expected) {
        dirtyCount += 1;
        console.error(`protocol artifacts out of date: ${rel}`);
      }
      continue;
    }

    ensureParentDir(output.path);
    fs.writeFileSync(output.path, expected, 'utf8');
    console.log(`generated ${rel}`);
  }

  if (checkOnly && dirtyCount > 0) {
    console.error(`protocol artifact check failed (${dirtyCount} file(s) differ).`);
    process.exit(1);
  }

  if (checkOnly) {
    if (bufLint.skipped) {
      console.log('protocol artifact check passed (buf lint skipped: binary not installed)');
    } else {
      console.log('protocol artifact check passed');
    }
  }
}

main();
