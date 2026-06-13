import type {
  AssistantCard,
  AssistantCardOption,
  AssistantCardValue,
} from '../api/types';

type FormCard = Extract<AssistantCard, { type: 'form' }>;
type FormField = FormCard['fields'][number];

export type NormalizedFormField = {
  name: string;
  label: string;
  required?: boolean;
  type: 'text' | 'select' | 'multiselect' | 'boolean' | 'number';
  options: Array<NormalizedOption>;
  value?: AssistantCardValue;
  placeholder: string;
  helperText?: string;
};

export type NormalizedOption = {
  label: string;
  value: string | number | boolean;
};

export function getTableCellValue(
  row:
    | Record<string, AssistantCardValue>
    | Array<AssistantCardValue>
    | { cells?: Array<AssistantCardValue>; values?: Array<AssistantCardValue> },
  column: { key: string; label: string },
  columnIndex: number,
): AssistantCardValue | undefined {
  if (Array.isArray(row)) {
    return row[columnIndex];
  }

  if ('cells' in row && Array.isArray(row.cells)) {
    return row.cells[columnIndex];
  }

  if ('values' in row && Array.isArray(row.values)) {
    return row.values[columnIndex];
  }

  const objectRow = row as Record<string, AssistantCardValue>;

  if (column.key in objectRow) {
    return objectRow[column.key];
  }

  if (column.label in objectRow) {
    return objectRow[column.label];
  }

  const normalizedKey = normalizeTableKey(column.key);
  const normalizedLabel = normalizeTableKey(column.label);

  for (const [rowKey, value] of Object.entries(objectRow)) {
    const normalizedRowKey = normalizeTableKey(rowKey);
    if (
      normalizedRowKey === normalizedKey ||
      normalizedRowKey === normalizedLabel
    ) {
      return value;
    }
  }

  return undefined;
}

export function normalizeTableKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getColumnKey(
  column: { key?: string; label?: string; title?: string; name?: string },
  index: number,
) {
  const label = getColumnLabel(column, index);
  return typeof column.key === 'string' && column.key
    ? column.key
    : normalizeTableKey(label) || `col_${index}`;
}

export function getColumnLabel(
  column: { key?: string; label?: string; title?: string; name?: string },
  index: number,
) {
  return getDisplayText(column) || `Column ${index + 1}`;
}

export function normalizeField(field: FormField): NormalizedFormField {
  const options = (field.options ?? [])
    .map(normalizeOption)
    .filter((option): option is NormalizedOption => option !== null);

  const type = normalizeFieldType(field, options.length > 0);
  return {
    name: field.name,
    label: field.label || field.name,
    required: field.required,
    type,
    options,
    value: field.value,
    placeholder:
      field.placeholder || getDefaultFieldPlaceholder(field.label || field.name, type),
    helperText: field.helperText,
  };
}

function normalizeFieldType(
  field: FormField,
  hasOptions: boolean,
): NormalizedFormField['type'] {
  if (field.type) {
    return field.type;
  }
  if (typeof field.value === 'boolean') {
    return 'boolean';
  }
  if (Array.isArray(field.value)) {
    return 'multiselect';
  }
  if (hasOptions) {
    return 'select';
  }
  return 'text';
}

function normalizeOption(
  option: AssistantCardOption | string | number | boolean,
): NormalizedOption | null {
  if (
    typeof option === 'string' ||
    typeof option === 'number' ||
    typeof option === 'boolean'
  ) {
    return {
      label: String(option),
      value: option,
    };
  }

  const label = getDisplayText(option);
  const value = option.value ?? option.id ?? label;

  if (label == null || value == null || label === '') {
    return null;
  }

  return {
    label,
    value,
  };
}

export function getDisplayText(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const candidate = value as Record<string, unknown>;
  const textCandidate =
    candidate.label ??
    candidate.text ??
    candidate.title ??
    candidate.name ??
    candidate.value ??
    candidate.id;

  return (
    typeof textCandidate === 'string' ||
    typeof textCandidate === 'number' ||
    typeof textCandidate === 'boolean'
      ? String(textCandidate)
      : ''
  );
}

function getDefaultFieldPlaceholder(
  label: string,
  type: NormalizedFormField['type'],
) {
  switch (type) {
    case 'number':
      return 'Enter a numeric value';
    case 'boolean':
      return 'Choose Yes or No';
    case 'multiselect':
      return 'Select one or more options';
    case 'select':
      return 'Select an option';
    case 'text':
    default:
      return `Provide ${label.toLowerCase()}`;
  }
}
