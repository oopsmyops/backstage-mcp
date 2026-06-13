import { Chip } from '@material-ui/core';
import { Link } from '@backstage/core-components';

interface EntityLinkProps {
  kind: string;
  namespace: string;
  name: string;
  url: string;
}

export function EntityLink({ kind, namespace, name, url }: EntityLinkProps) {
  const label = namespace === 'default' ? `${kind}:${name}` : `${kind}:${namespace}/${name}`;

  return (
    <Link to={url} title={`View ${label} in catalog`}>
      <Chip
        size="small"
        label={label}
        clickable
        color="primary"
        variant="outlined"
        style={{ cursor: 'pointer', margin: '0 2px' }}
        aria-label={`Navigate to ${label}`}
      />
    </Link>
  );
}
