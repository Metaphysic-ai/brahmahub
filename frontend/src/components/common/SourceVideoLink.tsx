import { Film } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAssetByPath } from '@/hooks/useAssets';

interface SourceVideoLinkProps {
  sourcePath?: string | null;
}

export function SourceVideoLink({ sourcePath }: SourceVideoLinkProps) {
  const { data: asset } = useAssetByPath(sourcePath);

  if (!asset) return null;

  return (
    <Link
      to={`/packages/${asset.package_id}`}
      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline transition-colors"
    >
      <Film size={12} />
      Open source video
    </Link>
  );
}
