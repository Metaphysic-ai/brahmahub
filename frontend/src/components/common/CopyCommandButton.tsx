import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { displayPath } from '@/lib/paths';

interface CopyCommandButtonProps {
  label: string;
  command: string;
}

export function CopyCommandButton({ label, command }: CopyCommandButtonProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const normalized = displayPath(command);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(normalized);
    setCopied(true);
    toast({ title: 'Command copied', description: normalized, duration: 2000 });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="h-7 text-xs gap-1.5"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {label}
    </Button>
  );
}
