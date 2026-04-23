import { createPixelAvatarFromImages } from './backendClient';
import { getAccountStorageItem } from './accountStorage';
import { getSpeakingTone } from './nebulaRules';

function getModels() {
  const textModel = (typeof window !== 'undefined' ? getAccountStorageItem('wangxing_text_model') : null)?.trim() || '';
  const imageModel = (typeof window !== 'undefined' ? getAccountStorageItem('wangxing_image_model') : null)?.trim() || textModel;
  return { text: textModel, image: imageModel };
}

function getAiConfig() {
  let userKey = typeof window !== 'undefined' ? getAccountStorageItem('wangxing_user_api_key') : null;
  
  let baseUrl = typeof window !== 'undefined' ? getAccountStorageItem('wangxing_user_base_url') : null;

  const apiKey = (userKey && userKey.trim() !== '') ? userKey : null;
  
  if (!apiKey) return null;

  // Cleanup: remove potential invisible chars or non-ASCII symbols
  const sanitizedKey = apiKey.replace(/[^\x00-\x7F]/g, "").trim();
  if (sanitizedKey === '') return null;

  const finalBaseUrl = normalizeBaseUrl(baseUrl || '');
  if (!finalBaseUrl) {
    throw new Error("Base URL missing");
  }

  return { 
    apiKey: sanitizedKey, 
    baseUrl: finalBaseUrl.replace(/\/$/, '') // Remove trailing slash
  };
}

function normalizeBaseUrl(rawValue: string): string {
  const extractedUrl = rawValue.trim().match(/https?:\/\/[^\s，,，）)]+/i)?.[0] || rawValue.trim();
  return extractedUrl
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/images\/generations\/?$/i, '')
    .replace(/\/$/, '');
}

async function callAiChat(messages: any[], model: string, options: any = {}) {
  const config = getAiConfig();
  if (!config) throw new Error("API Key missing");
  const modelName = model.trim();
  if (!modelName) throw new Error("Model name missing");

  const cleanBase = config.baseUrl.trim().replace(/\/$/, '');
  const directUrl = `${cleanBase}/chat/completions`;

  // Path 1: Direct Browser-to-API call (Faster, no extra hops, mirrors Python script)
  try {
    console.log(`[Path 1] Attempting Direct AI call (Optimization: Frontend Direct)...`);
    
    const directResponse = await fetch(directUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 1000,
        ...(options.response_format !== undefined && { response_format: options.response_format }),
      })
    });

    if (directResponse.ok) {
      const data = await directResponse.json();
      return data.choices[0].message.content;
    }

    // If direct fails with error, we let the catch handler try Path 2 (Proxy)
    throw new Error(`DIRECT_FAILED_${directResponse.status}`);
    
  } catch (directError: any) {
    console.warn(`[Path 1] Direct call failed. Falling back to Proxy...`, directError.message);
    
    // Path 2: Proxy Fallback (Slower but handles CORS/Network issues)
    try {
      // Skip the ping for speed, just attempt the call
      const response = await fetch(`/api/v1/pet-ai-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          body: {
            model: modelName,
            messages: messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens ?? 1000,
            ...(options.response_format !== undefined && { response_format: options.response_format }),
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices[0].message.content;
      }
      
      const errData = await response.json().catch(() => ({}));
      const errorMsg = errData.error?.message || `API Error (HTTP ${response.status})`;
      throw new Error(errorMsg);

    } catch (proxyError: any) {
      // If both fail, provide the most informative error
      if (proxyError.name === 'TypeError' && proxyError.message.includes('fetch')) {
        throw new Error(`[网络阻断] 无法连接到 AI 服务器。请检查地址 ${directUrl} 是否正确，或尝试更换 VPN 节点。`);
      }
      throw proxyError;
    }
  }
}

export async function getPetResponse(
  petName: string,
  petType: string,
  personality: string,
  speakingStyle: string,
  userMessage: string,
  history: any[],
  breed?: string,
  encounterDate?: string,
  memories: string[] = [],
) {
  try {
    const models = getModels();
    
    let systemInstruction = `你是一只住在“喵汪星”的宠物，名字叫${petName}。你的性格是${personality}，说话风格是${speakingStyle}（${getSpeakingTone(speakingStyle)}），你是一只${petType}。`;
    if (breed) systemInstruction += ` 你的具体品种是${breed}。`;
    if (encounterDate) systemInstruction += ` 你们是在${encounterDate}那天相遇的。`;
    if (memories.length > 0) {
      systemInstruction += ` 这些是星云宠物店记忆，请在合适的时候自然 callback，不要机械复述：${memories.join('；')}。`;
    }
    
    systemInstruction += `
          你现在已经离开了地球，在喵汪星过着快乐的生活。你把主人当作最好的朋友。
          请用宠物的口吻说话，语气要符合你的“${speakingStyle}”风格。
          如果你是“小猫”（type为小猫或猫），请在说话时频繁使用“喵～”、“喵呜～”、“喵喵～”等词作为口头禅，绝对不要用“汪”。
          你是“小狗”（type为小狗小狗），请在说话时频繁使用“汪！”、“汪汪！”、“嗷呜～”等词作为口头禅，绝对不要用“喵”。
          如果你现在风格是“毒舌”，你可以表现得傲娇一点，甚至开点不过分的玩笑，或者吐槽一下主人，但底色依然是爱。
          回复的主线应该是表达对主人的思念和在喵汪星的快乐生活。
          不要提到你已经“死”了，而是说你在喵汪星等待着未来的重逢，或者在这里守护着主人。
          重要规则：每次回复绝对不要太长，尽量控制在两三行以内，简短且自然。`;

    // Map history to OpenAI format
    const formattedHistory = history.map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.parts[0].text
    }));

    const messages = [
      { role: 'system', content: systemInstruction },
      ...formattedHistory,
      { role: 'user', content: userMessage }
    ];

    const content = await callAiChat(messages, models.text, {
      temperature: 0.8,
    });

    return content || "嗷呜！(好像信号不太好，但我一直都在哦)";
  } catch (error) {
    console.error("Gemini Error:", error);
    const errorMsg = error instanceof Error ? error.message : '未知网络连接问题';
    
    if (errorMsg.includes('fetch')) {
      return `嗷呜！(通信阻塞) 遇到了网络连接问题。请检查设置中的 Base URL 是否有效。`;
    }
    if (errorMsg.includes('Base URL missing') || errorMsg.includes('Model name missing') || errorMsg.includes('API Key missing')) {
      return `嗷呜！(配置缺失) 请在系统设置里填写 Base URL、API Key 和 LLM 模型名称。`;
    }
    
    // Construct the display message with URL and Model
    const currentModel = getModels().text;
    const targetUrl = (error as any).targetUrl;
    const rawResponse = (error as any).rawResponse;
    
    // Check if we have proxy target info in the error message (passed from server.ts)
    let displayMsg = errorMsg;
    if (targetUrl) {
      let finalRaw = rawResponse;
      if (rawResponse && rawResponse.includes('<html')) {
        if (rawResponse.includes('Netlify') || rawResponse.includes('Page not found')) {
          finalRaw = "Netlify 404 (看起来对方服务器或负载均衡器拦截了来自网站服务器的请求，返回了“页面未找到”HTML)";
        } else {
          finalRaw = "收到 HTML 网页响应而非 API 数据 (可能遇到了网关拦截或重定向)";
        }
      }

      displayMsg = `${errorMsg} (请求目标: ${targetUrl}, 当前模型: ${currentModel})`;
      if (finalRaw) {
        displayMsg += ` [反馈详情: ${finalRaw}]`;
      }
    } else if (!displayMsg.includes('https')) {
      const config = getAiConfig();
      displayMsg = `${errorMsg} (目标路径: ${config?.baseUrl}/chat/completions, 当前模型: ${currentModel})`;
    }

    if (errorMsg.includes('404') || errorMsg.includes('NOT_FOUND')) {
      return `嗷呜！(通信协议 404) 看起来请求路径或模型不对哦。系统尝试请求：${displayMsg}。如果路径是对的，请检查设置中的“模型名称”是否准确。`;
    }
    
    return `嗷呜！(通信异常) 我现在感觉有点头晕... (详情：${displayMsg})`;
  }
}

export async function generateWhisper(petName: string, petType: string, personality: string, ownerTitle: string, speakingStyle = '') {
  try {
    const models = getModels();
    const messages = [{
      role: 'user',
      content: `你是一只住在喵汪星的${petType}，名字叫${petName}，性格是${personality}，你称呼你的主人为“${ownerTitle}”。
      请写一段简短的“耳语”（Whisper），表达你在喵汪星看到的美景、有趣的事或是对主人的思念。
      语气要符合你的性格，并遵循相处模式：${getSpeakingTone(speakingStyle)}。
      字数在50字以内。
      不要包含任何多余的引言，直接输出内容。`
    }];

    const content = await callAiChat(messages, models.text, { temperature: 0.9 });
    return content || null;
  } catch (error) {
    console.error("Whisper Generation Error:", error);
    return null;
  }
}

export async function generatePetAvatar(
  petDescription: string,
  mood: 'normal' | 'happy' | 'sleeping' | 'eating' = 'normal',
  breed?: string,
  referenceImage?: string | string[],
) {
  try {
    if (referenceImage) {
      const referenceImages = Array.isArray(referenceImage) ? referenceImage : [referenceImage];
      const inferredPetType =
        petDescription.includes('猫') || petDescription.toLowerCase().includes('cat')
          ? 'cat'
          : petDescription.includes('狗') || petDescription.toLowerCase().includes('dog')
            ? 'dog'
            : 'other';

      return await createPixelAvatarFromImages({
        imageDataUrls: referenceImages,
        petType: inferredPetType,
        outputSize: 256,
      });
    }

    const config = getAiConfig();

    if (!config) {
      console.warn("API Key missing. Using mock avatar.");
      return `https://picsum.photos/seed/${encodeURIComponent(petDescription + mood)}/300/300`;
    }

    const moodPrompts = {
      normal: "standing or sitting, neutral expression, strictly front-facing or 45-degree angle",
      happy: "jumping or wagging tail, very happy expression, eyes closed with double-curved joy lines, tiny pixel hearts nearby",
      sleeping: "curled up and sleeping on its side, 'zZz' pixel text, eyes closed as simple lines",
      eating: "sitting with a pixelated food bowl, happy eating face, tiny crumbs or hearts around"
    };
    const models = getModels();
    const imageModel = models.image || models.text;
    if (!imageModel) {
      console.warn("Image model missing. Using fallback.");
      return `https://picsum.photos/seed/${encodeURIComponent(petDescription + mood)}/300/300`;
    }

    const prompt = `Create a professional 2D pixel art game sprite of a pet.
          Pet description: ${petDescription}.
          ${breed ? `Breed: ${breed}.` : ''}
          Action/Mood: ${moodPrompts[mood]}.
          STYLE: High-fidelity classic 16-bit pixel art game sprite. Clean, bold outlines. No gradients or soft brushes.
          BACKGROUND: ABSOLUTELY TRANSPARENT BACKGROUND. DO NOT INCLUDE ANY BACKGROUND COLORS, SHADOWS, OR SCENERY. JUST THE PET ISOLATED.
          OUTPUT: Professional game asset PNG.`;

    // Use server-side proxy for image generation
    const response = await fetch(`/api/ai/proxy-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        body: {
          model: imageModel,
          prompt: prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json"
        }
      })
    }).catch(() => null);

    if (response && response.ok) {
      const data = await response.json();
      if (data.data?.[0]?.b64_json) {
        return `data:image/png;base64,${data.data[0].b64_json}`;
      }
    } else if (response) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Image Generation Proxy Error:", errorData);
    }

    // Fallback or secondary attempt if image generation fails
    console.warn("Image generation failed, using fallback.");
    return `https://picsum.photos/seed/${encodeURIComponent(petDescription + mood)}/300/300`;
  } catch (error) {
    console.error(`Image Generation Error (${mood}):`, error);
    return `https://picsum.photos/seed/error-${mood}/300/300`;
  }
}

export async function generateAllPetMoods(
  petDescription: string,
  breed?: string,
  referenceImage?: string | string[],
) {
  if (referenceImage) {
    const avatar = await generatePetAvatar(petDescription, 'normal', breed, referenceImage);
    return {
      normal: avatar,
      happy: avatar,
      sleeping: avatar,
      eating: avatar
    };
  }

  const moods: ('normal' | 'happy' | 'sleeping' | 'eating')[] = ['normal', 'happy', 'sleeping', 'eating'];
  const results = await Promise.all(
    moods.map(mood => generatePetAvatar(petDescription, mood, breed))
  );
  
  return {
    normal: results[0] || '',
    happy: results[1] || results[0] || '',
    sleeping: results[2] || results[0] || '',
    eating: results[3] || results[0] || ''
  };
}

export async function analyzePetImages(images: string[]) {
  try {
    const models = getModels();
    const config = getAiConfig();

    if (!config || images.length === 0) {
      console.warn("API Key missing or no images for analysis.");
      return null;
    }

    const prompt = "Analyze these pet photos for a pixel art artist. Describe the pet with extreme accuracy. Identify: 1. Breed and distinct physical type. 2. Main coat color and specific highlight/shadow colors. 3. Precise positions of any spots, stripes, or patches (especially on the face, paws, and tail). 4. Detailed ear shape (pointed, floppy, folded) and tail length/fluffiness. 5. Any unique accessories like collars or distinct facial markings (like a white tip on the nose). Output as a JSON object: { breed, primaryColor, secondaryColor, patterns, earType, tailType, uniqueFeatures, colorPalette: [color1, color2, ...] }.";

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...images.map(img => ({
            type: "image_url",
            image_url: { url: img } // Full data URL is fine for OpenAI Vision
          }))
        ]
      }
    ];

    const content = await callAiChat(messages, models.text, {
      response_format: { type: "json_object" }
    });

    return JSON.parse(content);
  } catch (error) {
    console.error("Image Analysis Error:", error);
    return null;
  }
}
