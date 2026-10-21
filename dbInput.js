function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array.`);
  }
  return value;
}

module.exports = { requireArray };
