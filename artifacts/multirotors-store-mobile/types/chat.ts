export interface InvoiceItem {
  title: string;
  price: number;
  quantity: number;
  source: 'store' | 'external';
  variantId?: string;
  productUrl?: string;
  imageUrl?: string;
}

export interface Invoice {
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  estimatedDeliveryDays: number;
  currency: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  invoice?: Invoice;
}

export type SseEvent =
  | { type: 'status'; message: string }
  | { type: 'text'; content: string }
  | { type: 'composition'; data: Invoice }
  | { type: 'done' };
