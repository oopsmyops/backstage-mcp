import { useEffect, useRef, useCallback } from 'react';
import { Box, Button, Typography, makeStyles } from '@material-ui/core';
import type { DisplayMessage } from '../../api/types';
import { MessageBubble } from './MessageBubble';

const useStyles = makeStyles(theme => ({
  root: {
    flex: 1,
    overflow: 'auto',
    padding: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: theme.spacing(1),
    color: theme.palette.text.secondary,
    padding: theme.spacing(1),
  },
  promptGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing(1),
    [theme.breakpoints.down('xs')]: {
      gridTemplateColumns: '1fr',
    },
  },
  promptCard: {
    justifyContent: 'flex-start',
    textAlign: 'left',
    textTransform: 'none',
    minHeight: 64,
    padding: theme.spacing(1),
    alignItems: 'flex-start',
    whiteSpace: 'normal',
    lineHeight: 1.3,
  },
  promptCardLabel: {
    display: 'block',
    width: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
}));

const QUICK_PROMPTS = [
  'Summarize TechDocs for a catalog component',
  'Find components owned by my teams',
  'Show APIs for a service or component',
  'Create a new service from a template',
];

interface MessageListProps {
  messages: DisplayMessage[];
  onSubmitCard?: (text: string) => void;
  onPromptClick?: (text: string) => void;
}

export function MessageList({
  messages,
  onSubmitCard,
  onPromptClick,
}: MessageListProps) {
  const classes = useStyles();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('http')) return;
    // Internal link — use pushState for SPA navigation
    e.preventDefault();
    window.history.pushState(null, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  if (messages.length === 0) {
    return (
      <Box className={classes.empty} role="log" aria-live="polite">
        <Typography variant="subtitle2">
          Start with a common task
        </Typography>
        <Box className={classes.promptGrid}>
          {QUICK_PROMPTS.map(prompt => (
            <Button
              key={prompt}
              className={classes.promptCard}
              variant="outlined"
              color="default"
              onClick={() => onPromptClick?.(prompt)}
            >
              <span className={classes.promptCardLabel}>{prompt}</span>
            </Button>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box className={classes.root} role="log" aria-live="polite" onClick={handleClick}>
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} onSubmitCard={onSubmitCard} />
      ))}
      <div ref={bottomRef} />
    </Box>
  );
}
