import { Link } from "wouter";
import { MessageSquare, Plus, Trash2, Drone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId?: number;
  onNewChat: () => void;
  onDelete: (id: number) => void;
  isLoading: boolean;
}

export function ChatSidebar({ conversations, activeId, onNewChat, onDelete, isLoading }: ChatSidebarProps) {
  return (
    <div className="w-72 border-r border-border bg-card flex flex-col z-10 shrink-0 h-full">
      <div className="p-4 border-b border-border">
        <Button 
          onClick={onNewChat} 
          className="w-full justify-start gap-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 hover:border-primary transition-all font-sans"
        >
          <Plus className="w-4 h-4" />
          START NEW CONSULTATION
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          <div className="text-xs font-sans text-muted-foreground uppercase tracking-wider px-2 py-2 mb-1">
            Recent Sessions
          </div>
          
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-2 space-y-2">
                <Skeleton className="h-4 w-full bg-border/50" />
                <Skeleton className="h-3 w-2/3 bg-border/50" />
              </div>
            ))
          ) : conversations.length === 0 ? (
            <div className="px-2 py-8 text-center text-muted-foreground">
              <Drone className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No active sessions.</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div 
                key={conv.id} 
                className={`group relative flex flex-col gap-1 p-3 rounded-md transition-colors ${
                  activeId === conv.id 
                    ? "bg-secondary text-secondary-foreground" 
                    : "hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Link href={`/chat/${conv.id}`} className="absolute inset-0 z-10" />
                
                <div className="flex items-center gap-2 pr-6">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium truncate">{conv.title}</span>
                </div>
                
                <div className="text-[10px] pl-6 opacity-70">
                  {formatDistanceToNow(new Date(conv.createdAt), { addSuffix: true })}
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive rounded-sm transition-all z-20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
