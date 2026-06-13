import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Fab,
  Box,
  Typography,
  IconButton,
  Select,
  MenuItem,
  makeStyles,
} from '@material-ui/core';
import {
  Chat as ChatIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
} from '@material-ui/icons';
import { MessageList } from '../MessageList';
import { InputBar } from '../InputBar';
import { OAuthPrompt } from '../OAuthPrompt';
import { useAssistant } from '../../hooks/useAssistant';
import { useVcsAuth } from '../../hooks/useVcsAuth';
import { deleteConversation, loadConversations } from '../../util/storage';

const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 520;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
const ACTIVE_CONV_KEY = 'backstage-assistant-active-conv';
const RESIZE_HANDLE_SIZE = 6;

function getActiveConversationId(): string {
  const stored = localStorage.getItem(ACTIVE_CONV_KEY);
  if (stored) return stored;
  const id = `conv-${Date.now()}`;
  localStorage.setItem(ACTIVE_CONV_KEY, id);
  return id;
}

const useStyles = makeStyles(theme => ({
  fab: {
    position: 'fixed',
    bottom: theme.spacing(3),
    right: theme.spacing(3),
    zIndex: theme.zIndex.modal + 1,
  },
  panel: {
    position: 'fixed',
    zIndex: theme.zIndex.modal,
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: theme.shadows[16],
    backgroundColor: 'transparent',
    backdropFilter: 'blur(16px)',
    border: `1px solid ${theme.palette.divider}`,
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      backgroundColor: theme.palette.background.paper,
      opacity: 0.88,
      borderRadius: 'inherit',
      zIndex: -1,
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(0.75, 1.5),
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    cursor: 'grab',
    userSelect: 'none',
    borderRadius: '12px 12px 0 0',
    '&:active': { cursor: 'grabbing' },
  },
  headerActions: {
    display: 'flex',
    gap: theme.spacing(0.25),
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modelBar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  modelLabel: {
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
  },
  modelSelect: {
    fontSize: '0.8rem',
    flex: 1,
  },
  resizeN: { position: 'absolute', top: 0, left: RESIZE_HANDLE_SIZE, right: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE, cursor: 'ns-resize' },
  resizeS: { position: 'absolute', bottom: 0, left: RESIZE_HANDLE_SIZE, right: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE, cursor: 'ns-resize' },
  resizeW: { position: 'absolute', left: 0, top: RESIZE_HANDLE_SIZE, bottom: RESIZE_HANDLE_SIZE, width: RESIZE_HANDLE_SIZE, cursor: 'ew-resize' },
  resizeE: { position: 'absolute', right: 0, top: RESIZE_HANDLE_SIZE, bottom: RESIZE_HANDLE_SIZE, width: RESIZE_HANDLE_SIZE, cursor: 'ew-resize' },
  resizeNW: { position: 'absolute', top: 0, left: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE, cursor: 'nwse-resize' },
  resizeNE: { position: 'absolute', top: 0, right: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE, cursor: 'nesw-resize' },
  resizeSW: { position: 'absolute', bottom: 0, left: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE, cursor: 'nesw-resize' },
  resizeSE: { position: 'absolute', bottom: 0, right: 0, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE, cursor: 'nwse-resize' },
}));

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ChatWidget() {
  const classes = useStyles();
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [bounds, setBounds] = useState<Bounds>({
    x: window.innerWidth - DEFAULT_WIDTH - 24,
    y: window.innerHeight - DEFAULT_HEIGHT - 80,
    w: DEFAULT_WIDTH,
    h: DEFAULT_HEIGHT,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  const [conversationId, setConversationId] = useState(getActiveConversationId);

  const {
    messages,
    loading,
    sendMessage,
    cancel,
    clearMessages,
    setMessages,
    oauthRequest,
    retryWithToken,
    rejectOAuth,
    models,
    selectedModel,
    setSelectedModel,
  } = useAssistant(conversationId);
  const { getVcsToken, rejectVcsAuth } = useVcsAuth();
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const conversations = loadConversations();
    const saved = conversations.find(c => c.id === conversationId);
    if (saved?.messages.length) {
      setMessages(saved.messages);
    } else {
      setMessages([]);
    }
  }, [conversationId, setMessages]);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  const handleClear = useCallback(() => {
    deleteConversation(conversationId);
    clearMessages();
    const nextId = `conv-${Date.now()}`;
    localStorage.setItem(ACTIVE_CONV_KEY, nextId);
    setConversationId(nextId);
  }, [clearMessages, conversationId]);

  const handleAuthorize = useCallback(async () => {
    if (!oauthRequest) return;
    setAuthLoading(true);
    try {
      const tokens = await getVcsToken(oauthRequest.provider, oauthRequest.scopes);
      await retryWithToken(tokens);
    } catch {
      const tokens = rejectVcsAuth(oauthRequest.provider);
      await rejectOAuth(tokens);
    } finally {
      setAuthLoading(false);
    }
  }, [oauthRequest, getVcsToken, retryWithToken, rejectOAuth, rejectVcsAuth]);

  const handleRejectAuthorize = useCallback(async () => {
    if (!oauthRequest) return;
    const tokens = rejectVcsAuth(oauthRequest.provider);
    await rejectOAuth(tokens);
  }, [oauthRequest, rejectOAuth, rejectVcsAuth]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false);
        else handleClose();
      }
    },
    [handleClose, fullscreen],
  );

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startBounds = { ...bounds };

    const onMove = (ev: MouseEvent) => {
      setBounds({
        ...startBounds,
        x: startBounds.x + (ev.clientX - startX),
        y: startBounds.y + (ev.clientY - startY),
      });
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [bounds]);

  const handleResize = useCallback((e: React.MouseEvent, edges: { n?: boolean; s?: boolean; w?: boolean; e?: boolean }) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...bounds };

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const next = { ...start };

      if (edges.e) next.w = Math.max(MIN_WIDTH, start.w + dx);
      if (edges.w) { next.w = Math.max(MIN_WIDTH, start.w - dx); next.x = start.x + start.w - next.w; }
      if (edges.s) next.h = Math.max(MIN_HEIGHT, start.h + dy);
      if (edges.n) { next.h = Math.max(MIN_HEIGHT, start.h - dy); next.y = start.y + start.h - next.h; }

      setBounds(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [bounds]);

  const toggleFullscreen = useCallback(() => setFullscreen(f => !f), []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) {
    return (
      <Fab
        className={classes.fab}
        color="primary"
        onClick={handleOpen}
        aria-label="Open AI assistant"
      >
        <ChatIcon />
      </Fab>
    );
  }

  const style: React.CSSProperties = fullscreen
    ? { top: 0, left: 0, width: '100vw', height: '100vh', borderRadius: 0 }
    : { top: bounds.y, left: bounds.x, width: bounds.w, height: bounds.h };

  return (
    <div className={classes.panel} style={style} onKeyDown={handleKeyDown}>
      {!fullscreen && (
        <>
          <div className={classes.resizeN} onMouseDown={e => handleResize(e, { n: true })} />
          <div className={classes.resizeS} onMouseDown={e => handleResize(e, { s: true })} />
          <div className={classes.resizeW} onMouseDown={e => handleResize(e, { w: true })} />
          <div className={classes.resizeE} onMouseDown={e => handleResize(e, { e: true })} />
          <div className={classes.resizeNW} onMouseDown={e => handleResize(e, { n: true, w: true })} />
          <div className={classes.resizeNE} onMouseDown={e => handleResize(e, { n: true, e: true })} />
          <div className={classes.resizeSW} onMouseDown={e => handleResize(e, { s: true, w: true })} />
          <div className={classes.resizeSE} onMouseDown={e => handleResize(e, { s: true, e: true })} />
        </>
      )}

      <Box className={classes.header} onMouseDown={handleDragStart}>
        <Typography variant="subtitle2">
          Backstage Assistant
        </Typography>
        <Box className={classes.headerActions}>
          <IconButton size="small" onClick={toggleFullscreen} style={{ color: 'inherit' }}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
          </IconButton>
          <IconButton size="small" onClick={handleClear} style={{ color: 'inherit' }} aria-label="Clear conversation">
            <DeleteIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={handleClose} style={{ color: 'inherit' }} aria-label="Close assistant">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {models.length > 1 && (
        <Box className={classes.modelBar}>
          <Typography variant="caption" className={classes.modelLabel}>
            Model
          </Typography>
          <Select
            className={classes.modelSelect}
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value as string)}
            disabled={loading}
            disableUnderline
            aria-label="Select model"
          >
            {models.map(m => (
              <MenuItem key={m.id} value={m.id}>
                {m.label}
              </MenuItem>
            ))}
          </Select>
        </Box>
      )}

      <Box className={classes.body}>
        <MessageList
          messages={messages}
          onSubmitCard={sendMessage}
          onPromptClick={sendMessage}
        />
        {oauthRequest && (
          <OAuthPrompt
            provider={oauthRequest.provider}
            scopes={oauthRequest.scopes}
            onAuthorize={handleAuthorize}
            onReject={handleRejectAuthorize}
            loading={authLoading}
          />
        )}
        <InputBar
          onSend={sendMessage}
          onCancel={cancel}
          loading={loading}
        />
      </Box>
    </div>
  );
}
