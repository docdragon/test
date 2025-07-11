import { GoogleGenAI, Type } from "@google/genai";

// This is a Vercel Serverless Function.
// It must be placed in the /api directory.
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Phương thức không được phép' });
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        return response.status(500).json({ error: 'Lỗi: Biến môi trường API_KEY không được cấu hình trên máy chủ.' });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    try {
        const { prompt, image, chatHistory, newChatMessage, mode } = request.body;

        // --- Handle Image Generation Request ---
        if (mode === 'image') {
            if (!prompt) {
                 return response.status(400).json({ error: 'Mô tả hình ảnh không được để trống.' });
            }
            
            // Step 1: Use Gemini to create a better prompt for Imagen
            const promptEnhancerResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Translate and enhance the following user request into a detailed, descriptive English prompt for an AI image generation model. The prompt should be a single, concise paragraph focusing on visual details. User request: "${prompt}"`,
                 config: {
                    // Lower temperature for more predictable prompt translation
                    temperature: 0.2,
                }
            });
            const enhancedPrompt = promptEnhancerResponse.text.trim();

            // Step 2: Generate the image with the enhanced prompt
            const imageResponse = await ai.models.generateImages({
                model: 'imagen-3.0-generate-002',
                prompt: enhancedPrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: '1:1',
                },
            });

            if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
                 return response.status(500).json({ error: 'AI không thể tạo ảnh từ mô tả này.' });
            }

            const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
            return response.status(200).json({ image: base64ImageBytes });
        }

        // --- Handle Chat Request (Streaming) ---
        if (newChatMessage) {
            let systemInstruction = null;
            let userAndModelHistory = chatHistory;

            const systemMessageIndex = chatHistory.findIndex(msg => msg.role === 'system');
            if (systemMessageIndex !== -1) {
                systemInstruction = chatHistory[systemMessageIndex]?.parts?.[0]?.text;
                userAndModelHistory = chatHistory.filter(msg => msg.role !== 'system');
            }
            
            const config = {};
            if (systemInstruction) {
                config.systemInstruction = systemInstruction;
            }

            // Set headers for streaming
            response.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            });

            const streamResult = await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: userAndModelHistory,
                config: config
            });

            for await (const chunk of streamResult) {
                response.write(chunk.text);
            }
            response.end();
            return; // End the function after streaming is complete
        }

        // --- Handle Calculator Request (JSON with Schema) ---
        if (prompt) {
             const promptParts = [];
            if (image && image.data && image.mimeType) {
                promptParts.push({
                    inlineData: {
                        mimeType: image.mimeType,
                        data: image.data,
                    },
                });
            }
            promptParts.push({ text: prompt });
            
            // Define the strict schema for the JSON response
            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    costBreakdown: {
                        type: Type.OBJECT,
                        properties: {
                            materialCosts: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { name: { type: Type.STRING }, cost: { type: Type.NUMBER }, reason: { type: Type.STRING } }
                                }
                            },
                            hiddenCosts: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { name: { type: Type.STRING }, cost: { type: Type.NUMBER }, reason: { type: Type.STRING } }
                                }
                            },
                            totalCost: { type: Type.NUMBER },
                            suggestedPrice: { type: Type.NUMBER },
                            estimatedProfit: { type: Type.NUMBER }
                        }
                    },
                    aiSuggestions: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING },
                            keyPoints: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: { type: { type: Type.STRING }, text: { type: Type.STRING } }
                                }
                            }
                        }
                    },
                    cuttingLayout: {
                        type: Type.OBJECT,
                        properties: {
                            totalSheetsUsed: { type: Type.INTEGER },
                            sheets: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        sheetNumber: { type: Type.INTEGER },
                                        pieces: {
                                            type: Type.ARRAY,
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    name: { type: Type.STRING },
                                                    x: { type: Type.INTEGER },
                                                    y: { type: Type.INTEGER },
                                                    width: { type: Type.INTEGER },
                                                    height: { type: Type.INTEGER }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            const genAIResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: promptParts },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                }
            });

            try {
                const parsedData = JSON.parse(genAIResponse.text);
                return response.status(200).json(parsedData);
            } catch(parseError) {
                console.error("Serverless function: Failed to parse JSON from Gemini response.", parseError);
                console.error("Original text from Gemini:", genAIResponse.text);
                return response.status(500).json({ error: `Phản hồi từ AI không phải là JSON hợp lệ. Nội dung: ${genAIResponse.text}`});
            }
        }

        return response.status(400).json({ error: 'Yêu cầu không hợp lệ. Thiếu "prompt", "newChatMessage", hoặc "mode".' });

    } catch (error) {
        console.error("Error in serverless function:", error);
        const errorMessage = error.message || "Đã xảy ra lỗi không xác định trên máy chủ.";
        // Avoid sending a response if headers already sent (for streaming errors)
        if (!response.headersSent) {
            response.status(500).json({ error: `Lỗi nội bộ máy chủ: ${errorMessage}` });
        } else {
             response.end(); // Gracefully end the stream on error
        }
    }
}