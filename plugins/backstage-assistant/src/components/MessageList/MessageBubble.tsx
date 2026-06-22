import { useMemo, useState } from 'react';
import { Typography, Box, CircularProgress, Collapse, makeStyles } from '@material-ui/core';
import { CheckCircle as CheckCircleIcon, ExpandMore as ExpandMoreIcon } from '@material-ui/icons';
import ReactMarkdown from 'react-markdown';
import type { DisplayMessage } from '../../api/types';
import { replaceEntityRefsWithLinks } from '../../util/entityLinkParser';
import {
  collectEntityLinks,
  linkifyEntityNames,
} from '../../util/entityNameLinks';
import { AssistantCardRenderer } from './AssistantCardRenderer';

const useStyles = makeStyles(theme => ({
  userBubble: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    borderRadius: '16px 16px 4px 16px',
    padding: theme.spacing(1, 2),
    maxWidth: '85%',
    alignSelf: 'flex-end',
    wordBreak: 'break-word',
  },
  assistantBubble: {
    backgroundColor: theme.palette.background.paper,
    borderRadius: '16px 16px 16px 4px',
    padding: theme.spacing(1, 2),
    maxWidth: '85%',
    alignSelf: 'flex-start',
    wordBreak: 'break-word',
    '& p': { margin: theme.spacing(0.5, 0) },
    '& pre': {
      backgroundColor: theme.palette.background.default,
      padding: theme.spacing(1),
      borderRadius: 4,
      overflow: 'auto',
      fontSize: '0.8rem',
    },
    '& code': {
      fontSize: '0.85em',
      backgroundColor: theme.palette.background.default,
      padding: '2px 4px',
      borderRadius: 2,
    },
    '& a': { color: (theme.palette as any).link ?? theme.palette.primary.main },
    '& table': {
      borderCollapse: 'collapse',
      width: '100%',
      fontSize: '0.8rem',
      margin: theme.spacing(0.5, 0),
    },
    '& th, & td': {
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${theme.palette.divider}`,
      textAlign: 'left',
    },
    '& th': { fontWeight: 600 },
  },
  toolCallHeader: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    cursor: 'pointer',
    padding: theme.spacing(0.25, 0.75),
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 12,
    '&:hover': { color: theme.palette.text.primary },
  },
  toolCallStrip: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
    overflowX: 'auto',
    overflowY: 'hidden',
    maxWidth: '100%',
    paddingBottom: 2,
  },
  toolCallBlock: {
    flex: '0 0 auto',
    maxWidth: '100%',
  },
  toolCallContent: {
    paddingLeft: theme.spacing(1),
    borderLeft: `2px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(0.5),
    maxHeight: 300,
    overflow: 'auto',
    maxWidth: '100%',
  },
  timestamp: {
    fontSize: '0.65rem',
    color: theme.palette.text.hint,
    marginTop: 2,
  },
  uiBlock: {
    margin: theme.spacing(0.5, 0),
  },
}));

interface ToolCallBlockProps {
  name: string;
  result?: string;
  pending?: boolean;
  classes: ReturnType<typeof useStyles>;
}

function ToolCallBlock({ name, result, pending, classes }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const icon = pending ? (
    <CircularProgress size={12} />
  ) : (
    <CheckCircleIcon style={{ fontSize: 12 }} color="primary" />
  );

  return (
    <div className={classes.toolCallBlock}>
      <div className={classes.toolCallHeader} onClick={() => setExpanded(!expanded)}>
        {icon}
        <Typography variant="caption">{name}</Typography>
        {result && (
          <ExpandMoreIcon style={{ fontSize: 12, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        )}
      </div>
      {result && (
        <Collapse in={expanded}>
          <div className={classes.toolCallContent}>
            {/* Raw result for debugging; rich rendering happens inline as cards. */}
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.72rem',
              }}
            >
              {result}
            </pre>
          </div>
        </Collapse>
      )}
    </div>
  );
}

interface MessageBubbleProps {
  message: DisplayMessage;
  onSubmitCard?: (text: string) => void;
}

export function MessageBubble({ message, onSubmitCard }: MessageBubbleProps) {
  const classes = useStyles();
  const isUser = message.role === 'user';

  // Names mentioned in prose ("payment-service") aren't full refs, so the ref
  // linkifier misses them. Harvest the real entities from this message's tool
  // results and link bare-name mentions to the same catalog URLs as the table.
  const entityNameLinks = useMemo(
    () => (isUser ? new Map<string, string>() : collectEntityLinks(message.toolCalls)),
    [isUser, message.toolCalls],
  );

  const linkify = (text: string): string =>
    linkifyEntityNames(replaceEntityRefsWithLinks(text), entityNameLinks);

  const processedContent = isUser ? message.content : linkify(message.content);

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems={isUser ? 'flex-end' : 'flex-start'}
      mb={1}
    >
      <div className={isUser ? classes.userBubble : classes.assistantBubble}>
        {isUser ? (
          <Typography variant="body2">{message.content}</Typography>
        ) : (
          <>
            {message.toolCalls?.length ? (
              <div className={classes.toolCallStrip}>
                {message.toolCalls.map((tc, i) => (
                  <ToolCallBlock
                    key={tc.id || `${tc.name}-${i}`}
                    name={tc.name}
                    result={tc.result}
                    pending={tc.pending}
                    classes={classes}
                  />
                ))}
              </div>
            ) : null}
            {message.parts?.length
              ? message.parts.map((part, index) =>
                  part.type === 'text' ? (
                    <ReactMarkdown key={index}>
                      {linkify(part.text)}
                    </ReactMarkdown>
                  ) : (
                    <div className={classes.uiBlock} key={index}>
                      <AssistantCardRenderer
                        card={part.card}
                        onSubmit={onSubmitCard}
                      />
                    </div>
                  ),
                )
              : processedContent && (
                  // Fallback for messages persisted before ordered parts existed.
                  <ReactMarkdown>{processedContent}</ReactMarkdown>
                )}
          </>
        )}
      </div>
      <Typography className={classes.timestamp}>
        {new Date(message.timestamp).toLocaleTimeString()}
      </Typography>
    </Box>
  );
}
