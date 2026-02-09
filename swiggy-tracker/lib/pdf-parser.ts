import pdfParse from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ParsedOrder, ParsedItem } from './types';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY environment variable');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Using Gemini 2.5 Flash - latest stable model with best price-performance
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.1, // Lower temperature for more consistent JSON output
  }
});

/**
 * Parse a Swiggy invoice PDF using Gemini 1.5 Flash
 */
export async function parsePDF(pdfBuffer: Buffer): Promise<ParsedOrder> {
  // Extract text from PDF
  const data = await pdfParse(pdfBuffer);
  const text = data.text;

  // Send to Gemini for structured extraction
  const prompt = `You are parsing a Swiggy food delivery or Instamart grocery invoice. Extract the following information as JSON:

{
  "order_id": "string - the order ID number",
  "order_date": "string - date in YYYY-MM-DD format (convert from DD-MM-YYYY if needed)",
  "category": "string - either 'food' or 'grocery' (use 'grocery' if it mentions Instamart or Seller Name, otherwise 'food')",
  "restaurant_name": "string or null - restaurant name if category is food",
  "store_name": "string or null - store/seller name if category is grocery",
  "items": [
    {
      "item_name": "string - name of the item",
      "quantity": number,
      "total_price": number - net assessable value or taxable value for this item
    }
  ],
  "subtotal": number,
  "delivery_fee": number or null - delivery/handling/convenience fees,
  "taxes": number - total taxes (CGST + SGST + IGST),
  "discounts": number or null,
  "total_amount": number - grand total/invoice total
}

Important:
- For restaurant invoices: look for items with "OTH" unit, extract the Net Assessable Value column
- For Instamart: look for items with "NOS" unit, extract Taxable Value. Skip sample items (value = 0)
- Include ALL line items including packing charges, handling fees, etc.
- Taxes: sum all CGST, SGST, IGST values
- Return ONLY valid JSON, no markdown or explanation

Invoice text:
${text}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const jsonText = response.text();

  // Clean markdown formatting if present
  let cleanJson = jsonText.trim();
  if (cleanJson.startsWith('```json')) {
    cleanJson = cleanJson.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/```\n?/g, '');
  }

  // Parse JSON response
  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (e: any) {
    throw new Error(`Gemini returned invalid JSON: ${e.message}. Response: ${jsonText.substring(0, 200)}`);
  }

  // Validate required fields
  if (!parsed.order_id) {
    throw new Error('Gemini did not extract order_id');
  }
  if (!parsed.order_date) {
    throw new Error('Gemini did not extract order_date');
  }
  if (!parsed.items || parsed.items.length === 0) {
    throw new Error('Gemini did not extract any items');
  }

  // Return in our format
  return {
    order_id: String(parsed.order_id),
    order_date: parsed.order_date,
    order_time: null,
    category: parsed.category === 'grocery' ? 'grocery' : 'food',
    restaurant_name: parsed.category === 'food' ? parsed.restaurant_name : null,
    store_name: parsed.category === 'grocery' ? parsed.store_name : null,
    subtotal: parseFloat(parsed.subtotal) || 0,
    delivery_fee: parsed.delivery_fee ? parseFloat(parsed.delivery_fee) : undefined,
    taxes: parseFloat(parsed.taxes) || 0,
    discounts: parsed.discounts ? parseFloat(parsed.discounts) : undefined,
    total_amount: parseFloat(parsed.total_amount) || 0,
    payment_method: null,
    items: parsed.items.map((item: any) => ({
      item_name: String(item.item_name),
      quantity: parseInt(item.quantity) || 1,
      unit_price: item.unit_price ? parseFloat(item.unit_price) : undefined,
      total_price: parseFloat(item.total_price) || 0,
    })),
  };
}
