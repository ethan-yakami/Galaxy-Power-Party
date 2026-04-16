const manifest = require('../generated/protocol-manifest.json');

const MESSAGE_SCHEMA = Object.freeze(
  (manifest.messages || []).map((descriptor) => ({
    type: descriptor.type,
    direction: descriptor.direction,
    fields: (descriptor.fields || []).map((field) => ({
      name: field.name,
      type: field.type,
      required: field.required !== false,
      repeated: !!field.repeated,
      transitional: field.transitional || '',
    })),
  }))
);

module.exports = {
  MESSAGE_SCHEMA,
};
