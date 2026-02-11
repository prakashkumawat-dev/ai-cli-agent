import { tavily } from '@tavily/core';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export const CheckGeminiApiKey = async (api_key: string) => {
    try {
        const llm = new ChatGoogleGenerativeAI({
            model: "gemini-2.5-pro",
            temperature: 0,
            maxRetries: 2,
            apiKey: api_key
        });

        const aiMsg = await llm.invoke([
            [
                "system",
                "You always have to reply with 'api_key is valid', no matter what the person asks you.",
            ],
            ["human", "is my api_key valid?"],
        ]);

        return {
            success: true,
            message: aiMsg.content
        };

    } catch (error: any) {

        return {
            success: false,
            message: error?.message
        }
    };
};


export const CheckTavilyApiKey = async (api_key: string) => {
    try {
        const tvly = tavily({ apiKey: api_key });
        await tvly.search("Who is the capital of rajasthan");

        return {
            success: true,
            message: "✅ Tavily_api_key is valid"
        }
    } catch (error: any) {
        return {
            success: false,
            message: error.message
        }
    }
};
