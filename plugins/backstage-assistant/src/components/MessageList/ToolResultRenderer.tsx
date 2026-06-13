import type React from 'react';
import { Typography, Chip, makeStyles, useTheme } from '@material-ui/core';
import { Launch as LaunchIcon } from '@material-ui/icons';
import { Link } from '@backstage/core-components';
import type { BackstageTheme } from '@backstage/theme';

const useStyles = makeStyles(theme => ({
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.8rem',
    marginTop: theme.spacing(0.5),
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
    '& tr:hover td': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  entityLink: {
    color: (theme.palette as any).link ?? theme.palette.primary.main,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    '&:hover': { textDecoration: 'underline' },
  },
  chip: {
    height: 20,
    fontSize: '0.7rem',
    margin: '1px 2px',
  },
  detail: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: theme.spacing(0.5, 1.5),
    fontSize: '0.8rem',
    marginTop: theme.spacing(0.5),
    '& dt': { fontWeight: 600, color: theme.palette.text.secondary },
    '& dd': { margin: 0 },
  },
  code: {
    fontSize: '0.75rem',
    overflow: 'auto',
    maxHeight: 200,
    margin: theme.spacing(0.5, 0),
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(1),
    borderRadius: 4,
  },
  statusBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: '0.75rem',
    fontWeight: 600,
  },
}));

interface ToolResultRendererProps {
  content: string;
}

export function ToolResultRenderer({ content }: ToolResultRendererProps) {
  const classes = useStyles();

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return <pre className={classes.code}>{content}</pre>;
  }

  if (typeof data !== 'object' || data === null) {
    return <pre className={classes.code}>{content}</pre>;
  }

  const obj = data as Record<string, unknown>;

  if (obj.entities && Array.isArray(obj.entities)) {
    return <EntityTable entities={obj.entities as EntityRow[]} classes={classes} />;
  }
  if (obj.apis && Array.isArray(obj.apis)) {
    return <EntityTable entities={obj.apis as EntityRow[]} classes={classes} />;
  }
  if (obj.templates && Array.isArray(obj.templates)) {
    return <EntityTable entities={obj.templates as EntityRow[]} classes={classes} />;
  }
  if (obj.tasks && Array.isArray(obj.tasks)) {
    return <TaskTable tasks={obj.tasks as TaskRow[]} classes={classes} />;
  }
  if (obj.spec && typeof obj.spec === 'string') {
    return <pre className={classes.code}>{obj.spec as string}</pre>;
  }
  if (obj.taskId && obj.status) {
    return <TaskStatus task={obj as unknown as TaskRow} classes={classes} />;
  }
  if (obj.ref && obj.kind) {
    return <EntityDetail entity={obj} classes={classes} />;
  }

  return <pre className={classes.code}>{JSON.stringify(data, null, 2)}</pre>;
}

interface EntityRow {
  ref?: string;
  name?: string;
  title?: string;
  description?: string;
  owner?: string;
  type?: string;
  tags?: string[];
  kind?: string;
}

function entityUrl(ref?: string): string {
  if (!ref) return '#';
  const match = ref.match(/^(\w+):(?:([^/]+)\/)?(.+)$/);
  if (!match) return '#';
  const [, kind, ns, name] = match;
  return `/catalog/${ns ?? 'default'}/${kind.toLowerCase()}/${name}`;
}

function InternalEntityLink({
  to,
  children,
  classes,
}: {
  to: string;
  children: React.ReactNode;
  classes: ReturnType<typeof useStyles>;
}) {
  if (to === '#') {
    return <span>{children}</span>;
  }
  return (
    <Link to={to} className={classes.entityLink}>
      {children}
    </Link>
  );
}

function EntityTable({ entities, classes }: { entities: EntityRow[]; classes: ReturnType<typeof useStyles> }) {
  if (!entities.length) {
    return <Typography variant="body2" color="textSecondary">No results found.</Typography>;
  }

  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Owner</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {entities.map((e, i) => (
          <tr key={e.ref ?? i}>
            <td>
              <InternalEntityLink to={entityUrl(e.ref)} classes={classes}>
                {e.title ?? e.name}
                <LaunchIcon style={{ fontSize: 12 }} />
              </InternalEntityLink>
            </td>
            <td>{e.type ?? e.kind ?? '—'}</td>
            <td>{e.owner ?? '—'}</td>
            <td>{truncate(e.description, 60)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface TaskRow {
  taskId?: string;
  status?: string;
  createdAt?: string;
  createdBy?: string;
  templateRef?: string;
}

function TaskTable({ tasks, classes }: { tasks: TaskRow[]; classes: ReturnType<typeof useStyles> }) {
  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th>Task</th>
          <th>Status</th>
          <th>Template</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t, i) => (
          <tr key={t.taskId ?? i}>
            <td>{t.taskId ? t.taskId.slice(0, 8) : '—'}</td>
            <td><StatusBadge status={t.status} classes={classes} /></td>
            <td>{t.templateRef ?? '—'}</td>
            <td>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TaskStatus({ task, classes }: { task: TaskRow; classes: ReturnType<typeof useStyles> }) {
  return (
    <div className={classes.detail}>
      <dt>Task ID</dt><dd>{task.taskId}</dd>
      <dt>Status</dt><dd><StatusBadge status={task.status} classes={classes} /></dd>
      {task.templateRef && <><dt>Template</dt><dd>{task.templateRef}</dd></>}
      {task.createdAt && <><dt>Created</dt><dd>{new Date(task.createdAt).toLocaleString()}</dd></>}
    </div>
  );
}

function EntityDetail({ entity, classes }: { entity: Record<string, unknown>; classes: ReturnType<typeof useStyles> }) {
  const tags = entity.tags as string[] | undefined;
  const relations = entity.relations as Array<{ type: string; targetRef: string }> | undefined;

  return (
    <div className={classes.detail}>
      <dt>Name</dt>
      <dd>
        <InternalEntityLink to={entityUrl(entity.ref as string)} classes={classes}>
          {(entity.title as string) ?? (entity.name as string)}
          <LaunchIcon style={{ fontSize: 12 }} />
        </InternalEntityLink>
      </dd>
      <dt>Kind</dt><dd>{String(entity.kind)}</dd>
      {entity.type ? <><dt>Type</dt><dd>{String(entity.type)}</dd></> : null}
      {entity.owner ? <><dt>Owner</dt><dd>{String(entity.owner)}</dd></> : null}
      {entity.description ? <><dt>Description</dt><dd>{String(entity.description)}</dd></> : null}
      {tags?.length && (
        <>
          <dt>Tags</dt>
          <dd>{tags.map(t => <Chip key={t} label={t} size="small" className={classes.chip} />)}</dd>
        </>
      )}
      {relations?.length && (
        <>
          <dt>Relations</dt>
          <dd>
            {relations.map((r, i) => (
              <div key={i}>
                <Typography variant="caption" color="textSecondary">{r.type}:</Typography>{' '}
                <InternalEntityLink to={entityUrl(r.targetRef)} classes={classes}>
                  {r.targetRef}
                </InternalEntityLink>
              </div>
            ))}
          </dd>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status, classes }: { status?: string; classes: ReturnType<typeof useStyles> }) {
  const theme = useTheme<BackstageTheme>();
  const statusPalette = (theme.palette as any).status ?? {};
  const colorMap: Record<string, string> = {
    completed: statusPalette.ok,
    failed: statusPalette.error,
    processing: statusPalette.running,
    open: statusPalette.pending,
    cancelled: statusPalette.aborted,
  };
  const bg = colorMap[status ?? ''] ?? statusPalette.aborted ?? theme.palette.grey[500];
  return (
    <span className={classes.statusBadge} style={{ backgroundColor: bg, color: '#fff' }}>
      {status ?? 'unknown'}
    </span>
  );
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
