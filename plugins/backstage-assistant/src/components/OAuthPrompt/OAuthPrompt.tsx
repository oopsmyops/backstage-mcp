import { Box, Button, Typography, Card, CardContent, makeStyles } from '@material-ui/core';
import { LockOpen as LockOpenIcon } from '@material-ui/icons';

const useStyles = makeStyles(theme => ({
  card: {
    margin: theme.spacing(1, 2),
    backgroundColor: theme.palette.warning.light,
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    padding: theme.spacing(2),
    '&:last-child': { paddingBottom: theme.spacing(2) },
  },
}));

interface OAuthPromptProps {
  provider: string;
  scopes: string[];
  onAuthorize: () => void;
  onReject: () => void;
  loading?: boolean;
}

export function OAuthPrompt({
  provider,
  scopes,
  onAuthorize,
  onReject,
  loading,
}: OAuthPromptProps) {
  return (
    <OAuthPromptCard
      provider={provider}
      scopes={scopes}
      onAuthorize={onAuthorize}
      onReject={onReject}
      loading={loading}
    />
  );
}

function OAuthPromptCard({
  provider,
  scopes,
  onAuthorize,
  onReject,
  loading,
}: OAuthPromptProps) {
  const classes = useStyles();

  return (
    <Card variant="outlined" className={classes.card}>
      <CardContent className={classes.content}>
        <LockOpenIcon />
        <Box flex={1}>
          <Typography variant="body2">
            This action requires {provider} authorization
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Scopes: {scopes.join(', ')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={onAuthorize}
          disabled={loading}
        >
          Authorize
        </Button>
        <Button
          variant="text"
          size="small"
          onClick={onReject}
          disabled={loading}
        >
          Not now
        </Button>
      </CardContent>
    </Card>
  );
}
