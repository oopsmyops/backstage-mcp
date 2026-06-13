import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControlLabel,
  Checkbox,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import type {
  AssistantCard,
  AssistantCardValue,
} from '../../api/types';
import {
  getColumnKey,
  getColumnLabel,
  getDisplayText,
  getTableCellValue,
  normalizeField,
  type NormalizedFormField,
} from '../../util/cardNormalization';

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: theme.spacing(0.5),
    minWidth: 0,
  },
  title: {
    marginBottom: theme.spacing(0.75),
    fontWeight: 600,
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.8rem',
    '& th': {
      textAlign: 'left',
      padding: theme.spacing(0.5, 1),
      borderBottom: `2px solid ${theme.palette.divider}`,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    },
    '& td': {
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${theme.palette.divider}`,
      verticalAlign: 'top',
    },
  },
  details: {
    display: 'grid',
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
    gap: theme.spacing(0.5, 1.5),
    fontSize: '0.85rem',
    '& dt': {
      color: theme.palette.text.secondary,
      fontWeight: 600,
    },
    '& dd': {
      margin: 0,
      minWidth: 0,
    },
  },
  field: {
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 0,
    },
  },
  fieldLabel: {
    display: 'block',
    marginBottom: theme.spacing(0.5),
  },
  fieldHelp: {
    marginTop: theme.spacing(0.5),
  },
  placeholder: {
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.75),
  },
  chip: {
    maxWidth: '100%',
  },
  code: {
    fontSize: '0.75rem',
    overflow: 'auto',
    maxHeight: 220,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(1),
    borderRadius: 4,
  },
  link: {
    color: (theme.palette as any).link ?? theme.palette.primary.main,
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  status: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: '0.75rem',
    fontWeight: 600,
    backgroundColor: theme.palette.grey[600],
    color: theme.palette.common.white,
  },
  submitBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: theme.spacing(1.5),
  },
}));

type FormCard = Extract<AssistantCard, { type: 'form' }>;

interface AssistantCardRendererProps {
  card: AssistantCard;
  onSubmit?: (text: string) => void;
}

export function AssistantCardRenderer({
  card,
  onSubmit,
}: AssistantCardRendererProps) {
  const classes = useStyles();

  return (
    <Box className={classes.root}>
      {card.title && (
        <Typography variant="subtitle2" className={classes.title}>
          {card.title}
        </Typography>
      )}
      {renderCardBody(card, classes, onSubmit)}
    </Box>
  );
}

function renderCardBody(
  card: AssistantCard,
  classes: ReturnType<typeof useStyles>,
  onSubmit?: (text: string) => void,
) {
  switch (card.type) {
    case 'text':
      return <Typography variant="body2">{card.body}</Typography>;
    case 'table':
      return <TableCard card={card} classes={classes} />;
    case 'details':
      return (
        <dl className={classes.details}>
          {card.items.map(item => (
            <ValuePair
              key={item.label}
              label={item.label}
              value={item.value}
              classes={classes}
            />
          ))}
        </dl>
      );
    case 'form':
      return <FormCardRenderer card={card} classes={classes} onSubmit={onSubmit} />;
    case 'document':
      return (
        <Box>
          {card.sections.map((section, index) => (
            <Box key={index} mb={1}>
              {section.heading && (
                <Typography variant="subtitle2">{section.heading}</Typography>
              )}
              {section.body && (
                <Typography variant="body2">{section.body}</Typography>
              )}
              {section.code && <pre className={classes.code}>{section.code}</pre>}
            </Box>
          ))}
        </Box>
      );
    case 'status':
      return (
        <Box>
          <span className={classes.status}>{card.status}</span>
          {card.items?.length ? (
            <dl className={classes.details}>
              {card.items.map(item => (
                <ValuePair
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  classes={classes}
                />
              ))}
            </dl>
          ) : null}
        </Box>
      );
    default:
      return null;
  }
}

function TableCard({
  card,
  classes,
}: {
  card: Extract<AssistantCard, { type: 'table' }>;
  classes: ReturnType<typeof useStyles>;
}) {
  const columns = card.columns.map((column, index) => ({
    key: getColumnKey(column, index),
    label: getColumnLabel(column, index),
  }));

  return (
    <div className={classes.tableWrap}>
      <table className={classes.table}>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {card.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, columnIndex) => (
                <td key={column.key}>
                  <CardValue
                    value={getTableCellValue(row, column, columnIndex)}
                    classes={classes}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormCardRenderer({
  card,
  classes,
  onSubmit,
}: {
  card: FormCard;
  classes: ReturnType<typeof useStyles>;
  onSubmit?: (text: string) => void;
}) {
  const normalizedFields = useMemo(
    () => card.fields.map(normalizeField),
    [card.fields],
  );
  const [values, setValues] = useState<Record<string, string | string[] | boolean>>(
    () => createInitialFieldValues(normalizedFields),
  );

  const updateValue = (name: string, value: string | string[] | boolean) => {
    setValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (!onSubmit) return;
    onSubmit(buildFormSubmissionMessage(card, normalizedFields, values));
  };

  return (
    <Box>
      {card.description && (
        <Typography variant="body2" color="textSecondary">
          {card.description}
        </Typography>
      )}
      {normalizedFields.map(field => (
        <Box key={field.name} className={classes.field}>
          <Typography variant="caption" color="textSecondary" className={classes.fieldLabel}>
            {field.label}
            {field.required ? ' *' : ''}
          </Typography>
          <FieldInput
            field={field}
            value={values[field.name]}
            classes={classes}
            onChange={value => updateValue(field.name, value)}
          />
          {field.helperText && (
            <Typography
              variant="caption"
              color="textSecondary"
              className={classes.fieldHelp}
            >
              {field.helperText}
            </Typography>
          )}
        </Box>
      ))}
      {card.actions?.map(action => (
        <Typography key={action.href} variant="body2">
          <SafeLink href={action.href} classes={classes}>
            {action.label}
          </SafeLink>
        </Typography>
      ))}
      {onSubmit && (
        <Box className={classes.submitBar}>
          <Button variant="contained" color="primary" size="small" onClick={handleSubmit}>
            Submit Values
          </Button>
        </Box>
      )}
    </Box>
  );
}

function FieldInput({
  field,
  value,
  classes,
  onChange,
}: {
  field: NormalizedFormField;
  value: string | string[] | boolean | undefined;
  classes: ReturnType<typeof useStyles>;
  onChange: (value: string | string[] | boolean) => void;
}) {
  if (field.type === 'boolean') {
    if (field.options.length > 0) {
      return (
        <Box className={classes.chipRow}>
          {field.options.map(option => {
            const selected = String(value) === String(option.value);
            return (
              <Chip
                key={`${field.name}-${String(option.value)}`}
                label={option.label}
                color={selected ? 'primary' : 'default'}
                clickable
                onClick={() => onChange(option.value === true || option.value === 'true')}
              />
            );
          })}
        </Box>
      );
    }

    return (
      <FormControlLabel
        control={
          <Checkbox
            checked={Boolean(value)}
            onChange={event => onChange(event.target.checked)}
            color="primary"
          />
        }
        label={field.placeholder}
      />
    );
  }

  if (field.options.length > 0) {
    if (field.type === 'multiselect') {
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <Box className={classes.chipRow}>
          {field.options.map(option => {
            const selected = selectedValues.includes(String(option.value));
            return (
              <Chip
                key={`${field.name}-${String(option.value)}`}
                label={option.label}
                color={selected ? 'primary' : 'default'}
                clickable
                onClick={() =>
                  onChange(
                    selected
                      ? selectedValues.filter(item => item !== String(option.value))
                      : [...selectedValues, String(option.value)],
                  )
                }
              />
            );
          })}
        </Box>
      );
    }

    return (
      <Box className={classes.chipRow}>
        {field.options.map(option => {
          const selected = String(value) === String(option.value);
          return (
            <Chip
              key={`${field.name}-${String(option.value)}`}
              label={option.label}
              color={selected ? 'primary' : 'default'}
              clickable
              onClick={() => onChange(String(option.value))}
            />
          );
        })}
      </Box>
    );
  }

  return (
    <TextField
      fullWidth
      variant="outlined"
      size="small"
      type={field.type === 'number' ? 'number' : 'text'}
      placeholder={field.placeholder}
      value={typeof value === 'string' ? value : ''}
      onChange={event => onChange(event.target.value)}
    />
  );
}

function ValuePair({
  label,
  value,
  classes,
}: {
  label: string;
  value: AssistantCardValue;
  classes: ReturnType<typeof useStyles>;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        <CardValue value={value} classes={classes} />
      </dd>
    </>
  );
}

function CardValue({
  value,
  classes,
}: {
  value: AssistantCardValue | undefined;
  classes: ReturnType<typeof useStyles>;
}) {
  if (value === undefined || value === null || value === '') {
    return <span>-</span>;
  }
  if (Array.isArray(value)) {
    return (
      <Box className={classes.chipRow}>
        {value.map(item => (
          <Chip
            key={String(item)}
            label={String(item)}
            size="small"
            className={classes.chip}
          />
        ))}
      </Box>
    );
  }
  if (typeof value === 'object') {
    const text = getDisplayText(value);
    const href = typeof value.href === 'string' ? value.href : undefined;
    if (href && text) {
      return (
        <SafeLink href={href} classes={classes}>
          {text}
        </SafeLink>
      );
    }
    return <span>{text || '-'}</span>;
  }
  return <span>{String(value)}</span>;
}

function SafeLink({
  href,
  children,
  classes,
}: {
  href?: string;
  children: string;
  classes: ReturnType<typeof useStyles>;
}) {
  const safeHref = getSafeHref(href);
  if (!safeHref) return <span>{children}</span>;
  return (
    <a className={classes.link} href={safeHref}>
      {children}
    </a>
  );
}

function createInitialFieldValues(fields: NormalizedFormField[]) {
  const initialValues: Record<string, string | string[] | boolean> = {};

  for (const field of fields) {
    if (field.type === 'boolean') {
      if (typeof field.value === 'boolean') {
        initialValues[field.name] = field.value;
      } else if (typeof field.value === 'string') {
        initialValues[field.name] = field.value === 'true';
      } else {
        initialValues[field.name] = false;
      }
      continue;
    }

    if (field.type === 'multiselect') {
      initialValues[field.name] = Array.isArray(field.value)
        ? field.value.map(item => String(item))
        : [];
      continue;
    }

    initialValues[field.name] = field.value == null ? '' : String(field.value);
  }

  return initialValues;
}

function buildFormSubmissionMessage(
  card: FormCard,
  fields: NormalizedFormField[],
  values: Record<string, string | string[] | boolean>,
) {
  const lines = fields.map(field => {
    const value = values[field.name];
    if (Array.isArray(value)) {
      return `${field.name}: ${value.join(', ')}`;
    }
    if (typeof value === 'boolean') {
      return `${field.name}: ${value ? 'true' : 'false'}`;
    }
    return `${field.name}: ${value || ''}`;
  });

  return [
    `Use these confirmed values for "${card.title ?? 'the form'}":`,
    ...lines,
  ].join('\n');
}

function getSafeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith('/')) return href;
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return href;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
