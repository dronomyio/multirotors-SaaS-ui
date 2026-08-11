import { z } from "zod";
export declare const InvoiceItemSchema: z.ZodObject<{
    title: z.ZodString;
    price: z.ZodNumber;
    quantity: z.ZodNumber;
    source: z.ZodEnum<["store", "external"]>;
    variantId: z.ZodOptional<z.ZodString>;
    productUrl: z.ZodOptional<z.ZodString>;
    imageUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    price: number;
    quantity: number;
    source: "external" | "store";
    variantId?: string | undefined;
    imageUrl?: string | undefined;
    productUrl?: string | undefined;
}, {
    title: string;
    price: number;
    quantity: number;
    source: "external" | "store";
    variantId?: string | undefined;
    imageUrl?: string | undefined;
    productUrl?: string | undefined;
}>;
export declare const InvoiceSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        price: z.ZodNumber;
        quantity: z.ZodNumber;
        source: z.ZodEnum<["store", "external"]>;
        variantId: z.ZodOptional<z.ZodString>;
        productUrl: z.ZodOptional<z.ZodString>;
        imageUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        price: number;
        quantity: number;
        source: "external" | "store";
        variantId?: string | undefined;
        imageUrl?: string | undefined;
        productUrl?: string | undefined;
    }, {
        title: string;
        price: number;
        quantity: number;
        source: "external" | "store";
        variantId?: string | undefined;
        imageUrl?: string | undefined;
        productUrl?: string | undefined;
    }>, "many">;
    subtotal: z.ZodNumber;
    tax: z.ZodNumber;
    shipping: z.ZodNumber;
    total: z.ZodNumber;
    estimatedDeliveryDays: z.ZodNumber;
    currency: z.ZodString;
}, "strip", z.ZodTypeAny, {
    items: {
        title: string;
        price: number;
        quantity: number;
        source: "external" | "store";
        variantId?: string | undefined;
        imageUrl?: string | undefined;
        productUrl?: string | undefined;
    }[];
    subtotal: number;
    tax: number;
    shipping: number;
    total: number;
    estimatedDeliveryDays: number;
    currency: string;
}, {
    items: {
        title: string;
        price: number;
        quantity: number;
        source: "external" | "store";
        variantId?: string | undefined;
        imageUrl?: string | undefined;
        productUrl?: string | undefined;
    }[];
    subtotal: number;
    tax: number;
    shipping: number;
    total: number;
    estimatedDeliveryDays: number;
    currency: string;
}>;
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
//# sourceMappingURL=invoice.d.ts.map