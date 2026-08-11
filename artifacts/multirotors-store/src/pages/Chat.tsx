import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { 
  useListOpenaiConversations, 
  useCreateOpenaiConversation, 
  useGetOpenaiConversation, 
  useDeleteOpenaiConversation,
  useCreateDraftOrder,
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatMain } from "@/components/chat/ChatMain";
import { Invoice } from "@/types/chat";
import { toast } from "sonner";

export default function Chat() {
  const params = useParams();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Read pre-fill query param (?q=...)
  const initialInput = useMemo(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    return new URLSearchParams(search).get("q") ?? "";
  }, []);
  
  // Is it a new conversation or existing?
  const isNew = !params.id || params.id === "new";
  const conversationId = isNew ? undefined : Number(params.id);

  const { data: conversations, isLoading: isConversationsLoading } = useListOpenaiConversations();
  const { data: conversationData, isLoading: isConversationLoading } = useGetOpenaiConversation(conversationId as number, { 
    query: { 
      enabled: !!conversationId, 
      queryKey: getGetOpenaiConversationQueryKey(conversationId as number) 
    } 
  });

  const createConversation = useCreateOpenaiConversation();
  const deleteConversation = useDeleteOpenaiConversation();
  const createDraftOrder = useCreateDraftOrder();

  const handleDelete = useCallback((id: number) => {
    deleteConversation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        if (id === conversationId) {
          setLocation("/chat");
        }
        toast.success("Conversation deleted");
      }
    });
  }, [conversationId, deleteConversation, queryClient, setLocation]);

  const handleNewChat = useCallback(() => {
    setLocation("/chat");
  }, [setLocation]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden">
      <Navbar />
      
      {/* 
        Navbar height is ~ 104px (announcement bar + nav).
        We'll use a wrapper with pt-[104px] that fills the screen and flexes its children.
      */}
      <div className="flex-1 flex pt-[104px] overflow-hidden">
        <ChatSidebar 
          conversations={conversations || []}
          activeId={conversationId}
          onNewChat={handleNewChat}
          onDelete={handleDelete}
          isLoading={isConversationsLoading}
        />
        
        <main className="flex-1 flex flex-col relative overflow-hidden bg-card/30">
          <ChatMain 
            conversationId={conversationId}
            conversation={conversationData}
            initialMessages={conversationData?.messages || []}
            isNew={isNew}
            initialInput={initialInput}
            createConversation={createConversation}
            createDraftOrder={createDraftOrder}
          />
        </main>
      </div>
    </div>
  );
}
