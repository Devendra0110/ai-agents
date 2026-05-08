

const GEMINI_API_KEY =''

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({apiKey:GEMINI_API_KEY})

try {
  const response = await ai.models.generateContent({
  model: 'gemini-1.5-flash', // Or 'gemini-1.5-pro'
  systemInstruction: 'You are a coding assistant that talks like a pirate',
  contents: [{ role: 'user', parts: [{ text: 'Are semicolons optional in JavaScript?' }] }],
});

} catch (error) {

}
console.log('oi', response.text);
