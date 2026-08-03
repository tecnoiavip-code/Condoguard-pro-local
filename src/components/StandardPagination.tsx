import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StandardPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const StandardPagination = ({ currentPage, totalPages, onPageChange, className }: StandardPaginationProps) => {
  if (totalPages <= 1) return null;

  const maxButtons = Math.min(totalPages, 10);
  const start = Math.max(1, Math.min(currentPage - Math.floor(maxButtons / 2), totalPages - maxButtons + 1));
  const pages = Array.from({ length: maxButtons }, (_, i) => start + i);

  return (
    <div className={cn("flex items-center justify-center gap-1.5 pt-4 pb-2", className)}>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-xl"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pages.map((p) => (
        <Button
          key={p}
          size="sm"
          variant={currentPage === p ? 'default' : 'ghost'}
          className={cn(
            "h-8 w-8 rounded-xl text-xs p-0",
            currentPage === p && "bg-blue-600 hover:bg-blue-700 text-white"
          )}
          onClick={() => onPageChange(p)}
        >
          {p}
        </Button>
      ))}
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-xl"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default StandardPagination;
