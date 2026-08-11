import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Sparkles,
  Bot,
  User,
  Search,
  Globe,
  Calculator,
  FileText,
  ListTree,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InvoiceCard } from "@/components/chat/InvoiceCard";
import { DraftOrderInput, Invoice, InvoiceSchema } from "@/types/chat";
import { toast } from "sonner";
import { getSendOpenaiMessageUrl } from "@workspace/api-client-react";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  invoice?: Invoice;
}

interface ChatMainProps {
  conversationId?: number;
  conversation?: any;
  initialMessages: any[];
  isNew: boolean;
  initialInput?: string;
  createConversation: any;
  createDraftOrder: any;
}

// ─── Status step config (maps SSE status strings → icon + label) ──────────────

const STATUS_STEPS: Array<{
  match: string;
  icon: React.ElementType;
  label: string;
  color: string;
}> = [
  { match: "Searching store catalog",    icon: Search,      label: "Searching store catalog…",       color: "text-yellow-400" },
  { match: "Browsing store collections", icon: ListTree,    label: "Browsing store collections…",    color: "text-yellow-400" },
  { match: "Fetching category",          icon: FolderOpen,  label: "Fetching category products…",    color: "text-yellow-400" },
  { match: "Searching the web",          icon: Globe,       label: "Searching web for external items…", color: "text-blue-400" },
  { match: "Calculating pricing",        icon: Calculator,  label: "Calculating pricing & shipping…", color: "text-gray-300" },
  { match: "Building pro-forma",         icon: FileText,    label: "Building pro-forma invoice…",    color: "text-green-400" },
];

function resolveStatus(raw: string) {
  const step = STATUS_STEPS.find((s) => raw.includes(s.match));
  return step ?? { icon: Loader2, label: raw || "Thinking…", color: "text-gray-400" };
}

// ─── Suggestion chips ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: "FPV racing stack",        query: "Build me a complete FPV racing stack" },
  { label: "GPS-denied inspection",   query: "I need a GPS-denied inspection drone" },
  { label: "Blue UAS compliance",     query: "What enterprise UAVs are Blue UAS compliant?" },
  { label: "LiDAR mapping payload",   query: "Quote me a LiDAR mapping payload for a hexacopter" },
  { label: "Quadruped robot",         query: "I need a quadruped robot for outdoor terrain research" },
  { label: "FPV long-range build",    query: "Build me a long-range FPV wing setup" },
];

// ─── Empty / welcome state ────────────────────────────────────────────────────

function EmptyState({ onSend }: { onSend: (q: string) => void }) {
  const [input, setInput] = useState("");

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_60%,rgba(250,204,21,0.04)_0%,transparent_70%)] pointer-events-none" />

      <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center mb-6">
        <Bot className="w-7 h-7 text-yellow-400" />
      </div>

      <h1 className="text-3xl font-black tracking-tight text-center mb-2">
        AI Drone Consultant
      </h1>
      <p className="text-muted-foreground text-sm text-center max-w-md mb-10 leading-relaxed">
        Describe your mission requirements and get a pro-forma invoice in seconds —
        in-store items direct to checkout, external items priced from live web data.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-2xl w-full mb-10">
        {SUGGESTIONS.map(({ label, query }) => (
          <button
            key={label}
            onClick={() => onSend(query)}
            className="text-left px-3 py-2.5 border border-border bg-card/30 hover:bg-card hover:border-yellow-400/40 hover:text-yellow-300 transition-all rounded-md group text-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-400/60 group-hover:text-yellow-400 mb-1.5 transition-colors" />
            {label}
          </button>
        ))}
      </div>

      {/* Input at bottom of empty state */}
      <div className="w-full max-w-2xl">
        <div className="relative flex items-center bg-card border border-border focus-within:border-yellow-400/40 rounded-lg p-2 transition-colors shadow-lg">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), input.trim() && onSend(input))}
            placeholder="Describe your mission or product needs…"
            className="flex-1 bg-transparent border-none outline-none focus:ring-0 px-3 text-sm placeholder:text-muted-foreground/40"
          />
          <Button
            size="icon"
            onClick={() => input.trim() && onSend(input)}
            disabled={!input.trim()}
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Status pill shown during streaming ───────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const { icon: Icon, label, color } = resolveStatus(status);
  return (
    <div className={`inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-muted/40 border border-border ${color}`}>
      <Icon className="w-3.5 h-3.5 animate-spin" />
      {label}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatMain({
  conversationId,
  conversation,
  initialMessages,
  isNew,
  initialInput = "",
  createConversation,
  createDraftOrder,
}: ChatMainProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialInput);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [streamedInvoice, setStreamedInvoice] = useState<Invoice | undefined>();
  const [streamedStatus, setStreamedStatus] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  // ── Populate messages when conversation changes ──
  useEffect(() => {
    if (isNew) {
      setMessages([]);
    } else {
      setMessages(
        initialMessages.map((m) => {
          let invoice: Invoice | undefined;
          if (m.metadata) {
            const result = InvoiceSchema.safeParse(m.metadata);
            if (result.success) invoice = result.data;
          }
          return { id: m.id, role: m.role as "user" | "assistant", content: m.content, invoice };
        })
      );
    }
  }, [conversationId, isNew, initialMessages]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, streamedContent, streamedInvoice, isStreaming]);

  // ── Send handler ──
  const handleSend = async (content: string) => {
    if (!content.trim() || isStreaming) return;
    setInput("");
    inputRef.current?.focus();

    const tempUserMsg: Message = { id: Date.now(), role: "user", content };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      let targetConvId = conversationId;

      if (!targetConvId) {
        const newConv = await createConversation.mutateAsync({
          data: { title: content.slice(0, 60) + (content.length > 60 ? "…" : "") },
        });
        targetConvId = newConv.id;
        window.history.pushState({}, "", `/chat/${targetConvId}`);
      }

      if (!targetConvId) throw new Error("Missing conversation ID");

      setIsStreaming(true);
      setStreamedContent("");
      setStreamedInvoice(undefined);
      setStreamedStatus("");

      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${BASE}${getSendOpenaiMessageUrl(targetConvId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentText = "";
      let currentInvoice: Invoice | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.type === "status") {
              setStreamedStatus(payload.message);
            } else if (payload.type === "text") {
              setStreamedStatus("");
              currentText += payload.content;
              setStreamedContent(currentText);
            } else if (payload.type === "composition") {
              const parsed = InvoiceSchema.safeParse(payload.data);
              if (parsed.success) {
                currentInvoice = parsed.data;
                setStreamedInvoice(currentInvoice);
              }
            } else if (payload.type === "done") {
              setMessages((prev) => [
                ...prev,
                { id: Date.now(), role: "assistant", content: currentText, invoice: currentInvoice },
              ]);
              if (isNew) setLocation(`/chat/${targetConvId}`);
            }
          } catch {
            // Incomplete chunk — ignore
          }
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to send message. Please try again.");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsStreaming(false);
      setStreamedContent("");
      setStreamedInvoice(undefined);
      setStreamedStatus("");
    }
  };

  // ── Accept invoice → Shopify checkout ──
  const handleAcceptInvoice = (invoice: Invoice) => {
    if (!conversationId) return;

    const items: DraftOrderInput["items"] = invoice.items.map((item) => ({
      type: item.source === "store" ? "shopify" : "external",
      variantId: item.variantId,
      title: item.title,
      price: item.price,
      quantity: item.quantity,
      imageUrl: item.imageUrl,
    }));

    createDraftOrder.mutate(
      { id: conversationId, data: { items } },
      {
        onSuccess: (result: any) => {
          if (result.checkoutUrl) {
            window.open(result.checkoutUrl, "_blank");
          } else {
            toast.success("Draft order created — no checkout URL returned.");
          }
        },
        onError: () => {
          toast.error("Failed to create checkout. Please try again.");
        },
      }
    );
  };

  // ── Empty / welcome state ──
  if (isNew && messages.length === 0) {
    return <EmptyState onSend={handleSend} />;
  }

  // ── Active conversation ──
  return (
    <>
      <ScrollArea ref={scrollRef} className="flex-1 px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6 pb-4">
          {messages.map((m) =>
            m.role === "user" ? (
              // ── User bubble ──
              <div key={m.id} className="flex justify-end items-start gap-2">
                <div className="bg-yellow-400 text-black px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm font-medium max-w-[78%] leading-relaxed shadow-sm">
                  {m.content}
                </div>
                <div className="w-7 h-7 rounded-full bg-muted border border-border shrink-0 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
            ) : (
              // ── Assistant bubble ──
              <div key={m.id} className="flex justify-start items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-yellow-400/10 border border-yellow-400/20 shrink-0 flex items-center justify-center mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  {m.content && (
                    <div className="text-sm text-foreground/90 leading-relaxed mb-1 whitespace-pre-wrap">
                      {m.content}
                    </div>
                  )}
                  {m.invoice && (
                    <InvoiceCard
                      invoice={m.invoice}
                      onAccept={() => handleAcceptInvoice(m.invoice!)}
                      isAccepting={createDraftOrder.isPending}
                    />
                  )}
                </div>
              </div>
            )
          )}

          {/* ── Streaming state ── */}
          {isStreaming && (
            <div className="flex justify-start items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-yellow-400/10 border border-yellow-400/20 shrink-0 flex items-center justify-center mt-0.5">
                <Bot className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                {/* Status pill when no text yet */}
                {!streamedContent && streamedStatus && (
                  <div className="mb-3">
                    <StatusPill status={streamedStatus} />
                  </div>
                )}

                {/* Text accumulating */}
                {streamedContent && (
                  <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap mb-1">
                    {streamedContent}
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-yellow-400 animate-pulse align-middle" />
                  </div>
                )}

                {/* Status pill below text while tools still running */}
                {streamedContent && streamedStatus && (
                  <div className="mt-2">
                    <StatusPill status={streamedStatus} />
                  </div>
                )}

                {/* Invoice streaming in live */}
                {streamedInvoice && (
                  <InvoiceCard
                    invoice={streamedInvoice}
                    onAccept={() => handleAcceptInvoice(streamedInvoice)}
                    isAccepting={createDraftOrder.isPending}
                  />
                )}

                {/* Pure spinner when nothing yet */}
                {!streamedContent && !streamedStatus && !streamedInvoice && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs font-mono">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting to agent…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Input bar ── */}
      <div className="shrink-0 px-4 py-3 bg-background/80 backdrop-blur-md border-t border-border z-10">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-center bg-card border border-border focus-within:border-yellow-400/40 rounded-lg p-2 transition-colors shadow-sm">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend(input))
              }
              placeholder={isStreaming ? "Agent is working…" : "Follow up or ask something else…"}
              disabled={isStreaming}
              className="flex-1 bg-transparent border-none outline-none focus:ring-0 px-3 text-sm placeholder:text-muted-foreground/40 disabled:opacity-50"
            />
            <Button
              size="icon"
              onClick={() => handleSend(input)}
              disabled={!input.trim() || isStreaming}
              className="shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/40 mt-1.5">
            Store items go directly to Shopify checkout · External items are market estimates only
          </p>
        </div>
      </div>
    </>
  );
}
