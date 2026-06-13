import React, { useState, useCallback } from 'react';
import { Box, TextField, IconButton, makeStyles } from '@material-ui/core';
import { Send as SendIcon, Stop as StopIcon } from '@material-ui/icons';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    alignItems: 'flex-end',
    padding: theme.spacing(1, 2),
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  input: {
    flex: 1,
    marginRight: theme.spacing(1),
  },
}));

interface InputBarProps {
  onSend: (text: string) => void;
  onCancel: () => void;
  loading: boolean;
  disabled?: boolean;
}

export function InputBar({ onSend, onCancel, loading, disabled }: InputBarProps) {
  const classes = useStyles();
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <Box className={classes.root}>
      <TextField
        className={classes.input}
        variant="outlined"
        size="small"
        placeholder="Ask about your catalog, APIs, templates..."
        multiline
        maxRows={4}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || loading}
        autoFocus
        inputProps={{ 'aria-label': 'Chat message' }}
      />
      {loading ? (
        <IconButton
          size="small"
          onClick={onCancel}
          aria-label="Stop generating"
          color="secondary"
        >
          <StopIcon />
        </IconButton>
      ) : (
        <IconButton
          size="small"
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          aria-label="Send message"
          color="primary"
        >
          <SendIcon />
        </IconButton>
      )}
    </Box>
  );
}
