const fs = require('fs');
const path = require('path');
const { VALUE_MODEL_VERSION } = require('../config');

const DEFAULT_MODEL_PATH = path.join(__dirname, 'value-model.json');

let cachedPath = null;
let cachedModel = null;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberArray(value) {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function isMatrix(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((row) => isNumberArray(row));
}

function validateLayer(layer) {
  if (!layer || typeof layer !== 'object') return false;
  return isMatrix(layer.weights) && isNumberArray(layer.bias);
}

function validateModel(model, options = {}) {
  if (!model || typeof model !== 'object') return false;
  if (options.expectedVersion != null && model.version !== options.expectedVersion) return false;
  if (model.modelType !== 'mlp_tanh_v1') return false;
  if (!Array.isArray(model.featureOrder) || !model.featureOrder.every((item) => typeof item === 'string' && item)) {
    return false;
  }
  if (!model.normalization || typeof model.normalization !== 'object') return false;
  if (!isNumberArray(model.normalization.mean) || !isNumberArray(model.normalization.std)) return false;
  if (model.normalization.mean.length !== model.featureOrder.length) return false;
  if (model.normalization.std.length !== model.featureOrder.length) return false;
  if (!Array.isArray(model.layers) || model.layers.length !== 2) return false;
  if (!validateLayer(model.layers[0]) || !validateLayer(model.layers[1])) return false;
  if (model.layers[0].weights.length !== model.featureOrder.length) return false;
  const hiddenSize = model.layers[0].bias.length;
  if (hiddenSize <= 0) return false;
  if (!model.layers[0].weights.every((row) => row.length === hiddenSize)) return false;
  if (model.layers[1].weights.length !== hiddenSize) return false;
  if (!model.layers[1].weights.every((row) => row.length === model.layers[1].bias.length)) return false;
  if (model.layers[1].bias.length !== 1) return false;
  return true;
}

function loadValueModel(options = {}) {
  const resolvedPath = path.resolve(options.path || DEFAULT_MODEL_PATH);
  const forceReload = options.forceReload === true;
  const expectedVersion = options.expectedVersion;
  if (!forceReload && cachedPath === resolvedPath) {
    if (cachedModel && validateModel(cachedModel, { expectedVersion })) return cachedModel;
    return null;
  }

  cachedPath = resolvedPath;
  cachedModel = null;

  if (!fs.existsSync(resolvedPath)) return null;

  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!validateModel(parsed, { expectedVersion })) return null;
    cachedModel = parsed;
    return cachedModel;
  } catch {
    return null;
  }
}

function predictStateValue(featureVector, model) {
  if (!Array.isArray(featureVector) || !featureVector.every(isFiniteNumber)) return NaN;
  if (!validateModel(model)) return NaN;
  if (featureVector.length !== model.featureOrder.length) return NaN;

  const normalized = new Array(featureVector.length);
  for (let i = 0; i < featureVector.length; i += 1) {
    const std = model.normalization.std[i];
    const safeStd = Math.abs(std) > 1e-9 ? std : 1;
    normalized[i] = (featureVector[i] - model.normalization.mean[i]) / safeStd;
  }

  const hiddenSize = model.layers[0].bias.length;
  const hidden = new Array(hiddenSize).fill(0);
  for (let j = 0; j < hiddenSize; j += 1) {
    let sum = model.layers[0].bias[j];
    for (let i = 0; i < normalized.length; i += 1) {
      sum += normalized[i] * model.layers[0].weights[i][j];
    }
    hidden[j] = Math.tanh(sum);
  }

  let output = model.layers[1].bias[0];
  for (let j = 0; j < hidden.length; j += 1) {
    output += hidden[j] * model.layers[1].weights[j][0];
  }
  return Number.isFinite(output) ? output : NaN;
}

module.exports = {
  DEFAULT_MODEL_PATH,
  VALUE_MODEL_VERSION,
  loadValueModel,
  predictStateValue,
  validateModel,
};
