export class FieldError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const TEXT_LIMIT = 4000;

export function fail(where, message) {
  throw new FieldError(`${where}: ${message}`);
}

export function text(value, where, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || !value.trim()) fail(where, "нужна непустая строка");
  if (value.length > TEXT_LIMIT) fail(where, `строка длиннее ${TEXT_LIMIT} символов`);
  return value;
}

export function texts(value, where) {
  if (!Array.isArray(value) || value.length === 0) fail(where, "нужен непустой список строк");
  const items = value.map((item, index) => text(item, `${where}[${index}]`));
  if (new Set(items).size !== items.length) fail(where, "строки повторяются");
  return items;
}

export function list(value, where, each) {
  if (!Array.isArray(value) || value.length === 0) fail(where, "нужен непустой список");
  return value.map((item, index) => each(item, `${where}[${index}]`));
}

export function number(value, where, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(where, "нужно число");
  return value;
}

export function oneOf(value, allowed, where, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (!allowed.includes(value)) fail(where, `«${value}» нет среди вариантов: ${allowed.join(", ")}`);
  return value;
}

export { TEXT_LIMIT };
