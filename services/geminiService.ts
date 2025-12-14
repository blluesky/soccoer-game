import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

// Fallback messages for when AI is unavailable, offline, or quota exceeded
const FALLBACK_MESSAGES: {[key: string]: string[]} = {
  goal: [
    "골~! 정말 멋진 득점입니다!",
    "그물을 가르는 강력한 슈팅! 득점!",
    "수비를 완벽하게 따돌리고 골을 넣습니다!",
    "경기장이 뜨겁게 달아오릅니다! 골!",
    "키퍼가 손쓸 수 없는 완벽한 궤적입니다!",
    "환상적인 골입니다! 관중들이 열광합니다!"
  ],
  start: [
    "심판의 휘슬과 함께 경기가 시작됩니다!",
    "양 팀 선수들 힘차게 달려나갑니다!",
    "긴장감 넘치는 승부가 시작되었습니다!",
    "자, 경기 시작합니다!"
  ],
  end: [
    "경기가 종료되었습니다! 정말 치열한 승부였습니다.",
    "주심의 휘슬이 울리며 경기가 마무리됩니다.",
    "선수들 모두 최선을 다했습니다. 박수를 보냅니다!",
    "승패를 떠나 멋진 경기를 보여주었습니다."
  ],
  halftime: [
    "쿼터가 종료됩니다. 잠시 휴식 후 이어지겠습니다.",
    "치열한 공방전 끝에 휴식 시간이 찾아옵니다."
  ]
};

const getFallback = (event: string): string => {
  let category = 'generic';
  
  if (event.includes('득점') || event.includes('골')) category = 'goal';
  else if (event.includes('시작')) category = 'start';
  else if (event.includes('종료') || event.includes('승리')) category = 'end';
  else if (event.includes('휴식') || event.includes('쿼터')) category = 'halftime';

  if (category in FALLBACK_MESSAGES) {
      const msgs = FALLBACK_MESSAGES[category];
      return msgs[Math.floor(Math.random() * msgs.length)];
  }
  return event; // Return original text if no specific fallback found
};

const getAI = () => {
  if (!genAI && process.env.API_KEY) {
    genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return genAI;
};

export const generateCommentary = async (event: string, context: string): Promise<string> => {
  // 오프라인 체크
  if (!navigator.onLine) {
    return getFallback(event);
  }

  const ai = getAI();
  if (!ai) return getFallback(event);

  try {
    const prompt = `
      당신은 5:5 아케이드 축구 경기의 열정적이고 에너지가 넘치는 한국인 해설가입니다.
      상황: "${event}".
      맥락: "${context}".
      
      지침:
      1. 팀 명칭은 반드시 '블루팀', '레드팀'으로 정확히 부르세요. (예: '블루', '청팀' 사용 금지)
      2. 텍스트에 **굵게** 표시나 *기울임* 같은 마크다운 형식을 절대 사용하지 마세요.
      3. 해시태그(#)나 특수문자(~, -, @, ^, * 등)를 포함하지 마세요.
      4. 오직 아나운서가 소리내어 읽기 자연스러운 구어체 한글과 문장 부호(!, ?, ., ,)만 사용하세요.
      5. 매우 짧고 임팩트 있게 한 문장으로 외치세요 (최대 10단어).
      
      좋은 예시: "골! 블루팀이 환상적인 중거리 슛을 꽂아 넣습니다!", "아! 레드팀 골키퍼의 슈퍼 세이브입니다!"
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    return response.text.trim();
  } catch (error: any) {
    // Handle Quota Exceeded (429) gracefully
    const isQuotaError = error?.status === 429 || 
                         error?.code === 429 || 
                         (error?.message && error.message.includes('429')) ||
                         (error?.message && error.message.includes('RESOURCE_EXHAUSTED'));

    if (isQuotaError) {
        console.warn("Gemini API Quota Exceeded. Switching to internal fallback commentary.");
    } else {
        console.error("Gemini commentary error:", error);
    }
    
    // Always return fallback text so the game continues smoothly
    return getFallback(event);
  }
};