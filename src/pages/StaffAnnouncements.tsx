import { useState, useEffect, useRef } from 'react';
import StandardPagination from '@/components/StandardPagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Megaphone, Send, Paperclip, X, Eye, FileText, Loader2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { sendPushToUser } from '@/lib/push-subscription';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
  created_by: string;
  created_at: string;
}

interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  content_type: string | null;
}

interface ReadInfo {
  announcement_id: string;
  user_id: string;
  read_at: string;
}

const StaffAnnouncements = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; announcement: Announcement | null }>({ open: false, announcement: null });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reads, setReads] = useState<ReadInfo[]>([]);
  const [totalResidents, setTotalResidents] = useState(0);
  const [annPage, setAnnPage] = useState(1);
  const ANN_PAGE_SIZE = 10;

  const loadAnnouncements = async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    setAnnouncements((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadAnnouncements();

    const channel = supabase
      .channel('staff-announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => loadAnnouncements())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !user) return;

    setSending(true);
    try {
      const { data: ann, error } = await supabase
        .from('announcements')
        .insert({ title: title.trim(), body: body.trim(), priority, created_by: user.id })
        .select()
        .single();

      if (error) throw error;

      // Upload files
      if (files.length > 0 && ann) {
        for (const file of files) {
          const filePath = `${ann.id}/${Date.now()}_${file.name}`;
          const { error: upErr } = await supabase.storage
            .from('announcement-files')
            .upload(filePath, file);
          if (upErr) {
            console.error('Upload error:', upErr);
            continue;
          }

          const { data: urlData } = await supabase.storage
            .from('announcement-files')
            .createSignedUrl(filePath, 60 * 60 * 24 * 365);

          await supabase.from('announcement_attachments').insert({
            announcement_id: ann.id,
            file_name: file.name,
            file_url: urlData?.signedUrl || '',
            file_size: file.size,
            content_type: file.type,
          });
        }
      }

      // Notify all residents via push
      const { data: residents } = await supabase
        .from('residents')
        .select('auth_user_id');
      if (residents) {
        const pushTitle = priority === 'urgent' ? '🚨 Comunicado urgente' : '📢 Novo comunicado';
        for (const r of residents) {
          if (r.auth_user_id) {
            // In-app notification
            await supabase.from('notifications').insert({
              user_id: r.auth_user_id,
              title: pushTitle,
              body: title.trim().substring(0, 100),
              type: 'announcement',
              related_id: ann?.id,
            });
            // Push notification
            sendPushToUser(r.auth_user_id, pushTitle, title.trim().substring(0, 100), 'announcement');
          }
        }
      }

      toast.success('Comunicado enviado para todos os moradores!');
      setTitle('');
      setBody('');
      setPriority('normal');
      setFiles([]);
    } catch (err: any) {
      toast.error('Erro ao enviar comunicado: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter(f => f.size <= 20 * 1024 * 1024);
    if (valid.length < selected.length) {
      toast.error('Alguns arquivos excedem 20MB e foram ignorados');
    }
    setFiles(prev => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const openDetail = async (ann: Announcement) => {
    setDetailDialog({ open: true, announcement: ann });

    const [{ data: att }, { data: rd }, { count }] = await Promise.all([
      supabase.from('announcement_attachments').select('*').eq('announcement_id', ann.id),
      supabase.from('announcement_reads').select('*').eq('announcement_id', ann.id),
      supabase.from('residents').select('*', { count: 'exact', head: true }),
    ]);
    setAttachments((att as any) || []);
    setReads((rd as any) || []);
    setTotalResidents(count || 0);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este comunicado?')) return;
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir');
    } else {
      toast.success('Comunicado excluído');
      setDetailDialog({ open: false, announcement: null });
    }
  };

  const priorityBadge = (p: string) => {
    switch (p) {
      case 'urgent': return <Badge variant="destructive">Urgente</Badge>;
      case 'important': return <Badge variant="secondary">Importante</Badge>;
      default: return <Badge variant="outline">Normal</Badge>;
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Comunicados Gerais</h2>
        <p className="text-muted-foreground">Envie comunicados para todos os moradores</p>
      </div>

      {/* New announcement form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Novo Comunicado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-3 space-y-2">
                <Label>Título *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título do comunicado"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="important">Importante</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Escreva o comunicado..."
                rows={5}
                required
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <Label>Anexos</Label>
              <div className="flex flex-wrap gap-2">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-1 bg-muted px-3 py-1 rounded-full text-sm">
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    <span className="text-muted-foreground">({formatSize(file.size)})</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-destructive hover:text-destructive/80">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4 mr-1" />
                  Anexar
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.txt"
                />
              </div>
            </div>

            <Button type="submit" disabled={sending} className="w-full md:w-auto">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar Comunicado
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Announcements list */}
      <Card>
        <CardHeader>
          <CardTitle>Comunicados Enviados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : announcements.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum comunicado enviado ainda</p>
          ) : (
            (() => {
              const totalPages = Math.ceil(announcements.length / ANN_PAGE_SIZE);
              const paginated = announcements.slice((annPage - 1) * ANN_PAGE_SIZE, annPage * ANN_PAGE_SIZE);
              return (
                <>
                  {paginated.map((ann) => (
                    <div
                      key={ann.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => openDetail(ann)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {priorityBadge(ann.priority)}
                          <h3 className="font-semibold truncate">{ann.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{ann.body}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(ann.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <Eye className="h-5 w-5 text-muted-foreground ml-2 shrink-0" />
                    </div>
                  ))}
                  <StandardPagination currentPage={annPage} totalPages={totalPages} onPageChange={setAnnPage} />
                </>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog({ open, announcement: open ? detailDialog.announcement : null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailDialog.announcement && priorityBadge(detailDialog.announcement.priority)}
              {detailDialog.announcement?.title}
            </DialogTitle>
          </DialogHeader>

          {detailDialog.announcement && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enviado em {format(new Date(detailDialog.announcement.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>

              <div className="bg-muted/50 rounded-lg p-4 whitespace-pre-wrap text-sm">
                {detailDialog.announcement.body}
              </div>

              {/* Attachments */}
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

              {/* Read status */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Confirmações de Leitura</Label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all"
                      style={{ width: `${totalResidents > 0 ? (reads.length / totalResidents) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{reads.length}/{totalResidents}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {reads.length} de {totalResidents} moradores confirmaram a leitura
                </p>
              </div>

              <Button variant="destructive" size="sm" onClick={() => handleDelete(detailDialog.announcement!.id)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir Comunicado
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffAnnouncements;
