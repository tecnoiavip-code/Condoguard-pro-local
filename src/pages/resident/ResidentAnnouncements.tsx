import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Megaphone, CheckCircle, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import ResidentPagination from '@/components/resident/ResidentPagination';

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
  created_at: string;
}

interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
}

const ResidentAnnouncements = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; announcement: Announcement | null }>({ open: false, announcement: null });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [annPage, setAnnPage] = useState(1);
  const PAGE_SIZE = 10;
  const loadData = async () => {
    if (!user) return;

    const [{ data: anns }, { data: rds }] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('announcement_reads').select('announcement_id').eq('user_id', user.id),
    ]);

    setAnnouncements((anns as any) || []);
    setReadIds(new Set((rds as any)?.map((r: any) => r.announcement_id) || []));
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('resident-announcements')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => loadData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const openDetail = async (ann: Announcement) => {
    setDetailDialog({ open: true, announcement: ann });

    const { data: att } = await supabase
      .from('announcement_attachments')
      .select('*')
      .eq('announcement_id', ann.id);
    setAttachments((att as any) || []);

    if (user && !readIds.has(ann.id)) {
      const { error } = await supabase
        .from('announcement_reads')
        .insert({ announcement_id: ann.id, user_id: user.id });
      if (!error) {
        setReadIds(prev => new Set([...prev, ann.id]));
      }
    }
  };

  const priorityConfig: Record<string, { label: string; className: string }> = {
    urgent: { label: 'Urgente', className: 'bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/15' },
    important: { label: 'Importante', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15' },
    normal: { label: 'Normal', className: 'bg-muted text-muted-foreground border-border hover:bg-muted' },
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const unreadCount = announcements.filter(a => !readIds.has(a.id)).length;

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Comunicados</h2>
          <p className="text-sm text-muted-foreground">Avisos e comunicados do condomínio</p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="rounded-full">{unreadCount} novo{unreadCount > 1 ? 's' : ''}</Badge>
        )}
      </div>

      {announcements.length === 0 ? (
        <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-8 text-center">
          <Megaphone className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nenhum comunicado ainda</p>
        </div>
      ) : (
        (() => {
          const totalPages = Math.ceil(announcements.length / PAGE_SIZE);
          const paginated = announcements.slice((annPage - 1) * PAGE_SIZE, annPage * PAGE_SIZE);
          return (
            <div className="space-y-3">
              {paginated.map((ann) => {
                const isRead = readIds.has(ann.id);
                const pCfg = priorityConfig[ann.priority] || priorityConfig.normal;
                return (
                  <div
                    key={ann.id}
                    className={cn(
                      "bg-card/80 backdrop-blur-sm border rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.98]",
                      !isRead ? "border-primary/30 shadow-[0_0_15px_-5px] shadow-primary/20" : "border-border/50"
                    )}
                    onClick={() => openDetail(ann)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="outline" className={cn("text-xs", pCfg.className)}>
                            {pCfg.label}
                          </Badge>
                          {!isRead && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                        </div>
                        <h3 className="font-semibold text-foreground">{ann.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{ann.body}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(ann.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      {isRead && <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-1" />}
                    </div>
                  </div>
                );
              })}
              <ResidentPagination currentPage={annPage} totalPages={totalPages} onPageChange={setAnnPage} />
            </div>
          );
        })()
      )}

      <Dialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog({ open, announcement: open ? detailDialog.announcement : null })}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {detailDialog.announcement && (
                <Badge variant="outline" className={cn("text-xs", (priorityConfig[detailDialog.announcement.priority] || priorityConfig.normal).className)}>
                  {(priorityConfig[detailDialog.announcement.priority] || priorityConfig.normal).label}
                </Badge>
              )}
              {detailDialog.announcement?.title}
            </DialogTitle>
          </DialogHeader>

          {detailDialog.announcement && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {format(new Date(detailDialog.announcement.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>

              <div className="bg-muted/50 rounded-xl p-4 whitespace-pre-wrap text-sm">
                {detailDialog.announcement.body}
              </div>

              {attachments.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Anexos</Label>
                  {attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <FileText className="h-4 w-4" />
                      {att.file_name} {att.file_size && <span className="text-muted-foreground">({formatSize(att.file_size)})</span>}
                    </a>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-primary">
                <CheckCircle className="h-4 w-4" />
                Leitura confirmada
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResidentAnnouncements;
