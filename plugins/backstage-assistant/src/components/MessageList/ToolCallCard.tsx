import { useState } from 'react';
import { Card, CardContent, CardHeader, Collapse, IconButton, Typography, CircularProgress, makeStyles } from '@material-ui/core';
import { ExpandMore as ExpandMoreIcon, CheckCircle as CheckCircleIcon } from '@material-ui/icons';

const useStyles = makeStyles(theme => ({
  card: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    backgroundColor: theme.palette.background.default,
  },
  header: {
    padding: theme.spacing(1, 2),
    cursor: 'pointer',
  },
  content: {
    padding: theme.spacing(1, 2),
    '&:last-child': { paddingBottom: theme.spacing(1) },
  },
  pre: {
    fontSize: '0.75rem',
    overflow: 'auto',
    maxHeight: 200,
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  expandIcon: {
    transform: 'rotate(0deg)',
    transition: theme.transitions.create('transform', {
      duration: theme.transitions.duration.shortest,
    }),
  },
  expandIconOpen: {
    transform: 'rotate(180deg)',
  },
}));

interface ToolCallCardProps {
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  pending?: boolean;
}

export function ToolCallCard({
  name,
  arguments: args,
  result,
  pending,
}: ToolCallCardProps) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(false);

  const icon = pending ? (
    <CircularProgress size={18} />
  ) : (
    <CheckCircleIcon fontSize="small" color="primary" />
  );

  return (
    <Card variant="outlined" className={classes.card}>
      <CardHeader
        className={classes.header}
        avatar={icon}
        title={
          <Typography variant="body2">
            {name}
          </Typography>
        }
        action={
          <IconButton
            size="small"
            onClick={() => setExpanded(!expanded)}
            className={
              expanded ? classes.expandIconOpen : classes.expandIcon
            }
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ExpandMoreIcon />
          </IconButton>
        }
        onClick={() => setExpanded(!expanded)}
      />
      <Collapse in={expanded}>
        <CardContent className={classes.content}>
          <Typography variant="caption" color="textSecondary">
            Arguments
          </Typography>
          <pre className={classes.pre}>
            {JSON.stringify(args, null, 2)}
          </pre>
          {result && (
            <>
              <Typography
                variant="caption"
                color="textSecondary"
                style={{ marginTop: 8, display: 'block' }}
              >
                Result
              </Typography>
              <pre className={classes.pre}>{result}</pre>
            </>
          )}
        </CardContent>
      </Collapse>
    </Card>
  );
}
