import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChatMain } from '../ChatMain';
import type { Invoice } from '@/types/chat';

// Mock external deps that have no relevance to invoice rendering
vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@workspace/api-client-react', () => ({
  getSendOpenaiMessageUrl: (id: number) => `/api/conversations/${id}/messages`,
}));

// Minimal stub props — mutations are not called during these render-only tests
const stubCreateConversation = { mutateAsync: vi.fn() };
const stubCreateDraftOrder = { mutate: vi.fn(), isPending: false };

const SAMPLE_INVOICE: Invoice = {
  items: [
    {
      title: 'DJI Matrice 350 RTK',
      price: 6299.0,
      quantity: 1,
      source: 'store',
      variantId: 'gid://shopify/ProductVariant/123',
      imageUrl: undefined,
    },
  ],
  subtotal: 6299.0,
  tax: 503.92,
  shipping: 0,
  total: 6802.92,
  estimatedDeliveryDays: 5,
  currency: 'USD',
};

describe('ChatMain — invoice card rendering after page refresh (including malformed metadata)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an InvoiceCard when a message has metadata set to a valid Invoice', () => {
    const initialMessages = [
      {
        id: 1,
        role: 'assistant',
        content: 'Here is your quote.',
        // metadata IS the invoice object (stored directly in the jsonb column)
        metadata: SAMPLE_INVOICE,
      },
    ];

    render(
      <ChatMain
        conversationId={42}
        conversation={{ id: 42, title: 'Test' }}
        initialMessages={initialMessages}
        isNew={false}
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    // The invoice card header text is a reliable sentinel
    expect(screen.getByText('Pro-Forma Invoice')).toBeInTheDocument();

    // The item title from the invoice should be visible
    expect(screen.getByText('DJI Matrice 350 RTK')).toBeInTheDocument();

    // The accept button should be present
    expect(
      screen.getByRole('button', { name: /accept.*checkout/i }),
    ).toBeInTheDocument();
  });

  it('does NOT render an InvoiceCard when message metadata is null', () => {
    const initialMessages = [
      {
        id: 2,
        role: 'assistant',
        content: 'Let me know what you need.',
        metadata: null,
      },
    ];

    render(
      <ChatMain
        conversationId={43}
        conversation={{ id: 43, title: 'No invoice' }}
        initialMessages={initialMessages}
        isNew={false}
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    expect(screen.queryByText('Pro-Forma Invoice')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /accept.*checkout/i }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render an InvoiceCard when metadata is a malformed object (missing required fields)', () => {
    const initialMessages = [
      {
        id: 3,
        role: 'assistant',
        content: 'Something went wrong with the old data.',
        // Malformed: missing items, subtotal, tax, shipping, total, estimatedDeliveryDays, currency
        metadata: { broken: true, foo: 'bar' },
      },
    ];

    render(
      <ChatMain
        conversationId={45}
        conversation={{ id: 45, title: 'Malformed' }}
        initialMessages={initialMessages}
        isNew={false}
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    // No invoice card should appear for malformed metadata
    expect(screen.queryByText('Pro-Forma Invoice')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /accept.*checkout/i }),
    ).not.toBeInTheDocument();

    // The message content should still be visible
    expect(screen.getByText('Something went wrong with the old data.')).toBeInTheDocument();
  });

  it('does NOT render an InvoiceCard when metadata has items array but items are missing required fields', () => {
    const initialMessages = [
      {
        id: 4,
        role: 'assistant',
        content: 'Partial invoice.',
        // items present but missing price/quantity/source on each item; also missing top-level fields
        metadata: { items: [{ title: 'Some product' }] },
      },
    ];

    render(
      <ChatMain
        conversationId={46}
        conversation={{ id: 46, title: 'Partial malformed' }}
        initialMessages={initialMessages}
        isNew={false}
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    expect(screen.queryByText('Pro-Forma Invoice')).not.toBeInTheDocument();
  });

  it('renders multiple messages and only shows InvoiceCard for the one with metadata', () => {
    const initialMessages = [
      {
        id: 10,
        role: 'user',
        content: 'Quote me a drone kit.',
        metadata: null,
      },
      {
        id: 11,
        role: 'assistant',
        content: 'Sure, here is your quote:',
        metadata: null,
      },
      {
        id: 12,
        role: 'assistant',
        content: 'Invoice attached.',
        metadata: SAMPLE_INVOICE,
      },
    ];

    render(
      <ChatMain
        conversationId={44}
        conversation={{ id: 44, title: 'Multi-message' }}
        initialMessages={initialMessages}
        isNew={false}
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    // Message text should all be visible
    expect(screen.getByText('Quote me a drone kit.')).toBeInTheDocument();
    expect(screen.getByText('Sure, here is your quote:')).toBeInTheDocument();
    expect(screen.getByText('Invoice attached.')).toBeInTheDocument();

    // Only one invoice card should appear (for message id=12)
    expect(screen.getAllByText('Pro-Forma Invoice')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SSE streaming path — invoice rendering during a live conversation
// ---------------------------------------------------------------------------

describe('ChatMain — invoice card rendering via live SSE stream', () => {
  const encoder = new TextEncoder();

  function makeSseChunk(payload: object): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  }

  /** Build a ReadableStream that synchronously emits all events then closes. */
  function makeSseStream(events: object[]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(makeSseChunk(event));
        }
        controller.close();
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders InvoiceCard in the finalized message list after receiving composition then done events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        body: makeSseStream([
          { type: 'text', content: 'Here is your quote.' },
          { type: 'composition', data: SAMPLE_INVOICE },
          { type: 'done' },
        ]),
      }),
    );

    render(
      <ChatMain
        conversationId={42}
        conversation={{ id: 42, title: 'Test' }}
        initialMessages={[]}
        isNew={false}
        initialInput="Build me a drone"
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    // Trigger send via Enter key (initialInput pre-populates the state)
    fireEvent.keyDown(screen.getByPlaceholderText('Follow up or ask something else…'), {
      key: 'Enter',
    });

    // After the stream completes, the assistant message with the invoice
    // should appear in the finalized message list
    expect(await screen.findByText('Pro-Forma Invoice')).toBeInTheDocument();
    expect(screen.getByText('DJI Matrice 350 RTK')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /accept.*checkout/i }),
    ).toBeInTheDocument();
  });

  it('does NOT render an InvoiceCard when a malformed composition event arrives during streaming', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        body: makeSseStream([
          { type: 'text', content: 'Here is something.' },
          // Malformed: missing all required Invoice fields
          { type: 'composition', data: { broken: true, foo: 'bar' } },
          { type: 'done' },
        ]),
      }),
    );

    render(
      <ChatMain
        conversationId={42}
        conversation={{ id: 42, title: 'Test' }}
        initialMessages={[]}
        isNew={false}
        initialInput="Build me a drone"
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    // Trigger send via Enter key
    fireEvent.keyDown(screen.getByPlaceholderText('Follow up or ask something else…'), {
      key: 'Enter',
    });

    // Wait for the assistant text to appear (stream completed)
    expect(await screen.findByText('Here is something.')).toBeInTheDocument();

    // No invoice card should be rendered because the composition payload was invalid
    expect(screen.queryByText('Pro-Forma Invoice')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /accept.*checkout/i }),
    ).not.toBeInTheDocument();
  });

  it('removes the optimistic user message and shows an error toast when fetch throws a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const { toast } = await import('sonner');

    render(
      <ChatMain
        conversationId={42}
        conversation={{ id: 42, title: 'Test' }}
        initialMessages={[]}
        isNew={false}
        initialInput="Build me a drone"
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    // Trigger send — optimistic user message appears immediately
    fireEvent.keyDown(screen.getByPlaceholderText('Follow up or ask something else…'), {
      key: 'Enter',
    });

    // Wait for the error toast to fire (indicates the catch block ran)
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to send message. Please try again.',
      );
    });

    // The optimistic user message must have been rolled back
    expect(screen.queryByText('Build me a drone')).not.toBeInTheDocument();
  });

  it('removes the optimistic user message and shows an error toast when fetch returns body: null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ body: null }),
    );

    const { toast } = await import('sonner');

    render(
      <ChatMain
        conversationId={42}
        conversation={{ id: 42, title: 'Test' }}
        initialMessages={[]}
        isNew={false}
        initialInput="Build me a drone"
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    // Trigger send — optimistic user message appears immediately
    fireEvent.keyDown(screen.getByPlaceholderText('Follow up or ask something else…'), {
      key: 'Enter',
    });

    // Wait for the error toast to fire (indicates the catch block ran)
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to send message. Please try again.',
      );
    });

    // The optimistic user message must have been rolled back
    expect(screen.queryByText('Build me a drone')).not.toBeInTheDocument();
  });

  it('shows InvoiceCard in the streaming area when composition arrives before the done event', async () => {
    // Use a manually-controlled stream so we can inspect state between events
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ body: stream }));

    render(
      <ChatMain
        conversationId={42}
        conversation={{ id: 42, title: 'Test' }}
        initialMessages={[]}
        isNew={false}
        initialInput="Build me a drone"
        createConversation={stubCreateConversation}
        createDraftOrder={stubCreateDraftOrder}
      />,
    );

    // Kick off the SSE request
    fireEvent.keyDown(screen.getByPlaceholderText('Follow up or ask something else…'), {
      key: 'Enter',
    });

    // Emit only the composition event — done has NOT arrived yet
    streamController.enqueue(
      makeSseChunk({ type: 'composition', data: SAMPLE_INVOICE }),
    );

    // InvoiceCard must be visible in the streaming bubble before done is sent
    expect(await screen.findByText('Pro-Forma Invoice')).toBeInTheDocument();
    expect(screen.getByText('DJI Matrice 350 RTK')).toBeInTheDocument();

    // Finalize the stream inside act() so React flushes the async reader's
    // state updates (setMessages + setIsStreaming) before we assert
    await act(async () => {
      streamController.enqueue(makeSseChunk({ type: 'done' }));
      streamController.close();
      // Yield to let the reader's async loop drain and React batch-flush
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    // InvoiceCard must still be present in the finalized message list
    expect(screen.getByText('Pro-Forma Invoice')).toBeInTheDocument();
  });
});
