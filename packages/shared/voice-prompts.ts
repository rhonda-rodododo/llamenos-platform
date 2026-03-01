/**
 * Shared voice prompt data for all telephony adapters.
 *
 * This is the single source of truth for voice prompts, IVR menu prompts,
 * and voicemail thank-you messages. Each adapter imports from here instead
 * of maintaining its own copy.
 *
 * Provider-specific voice code mappings (VOICE_CODES, VONAGE_VOICE_CODES, etc.)
 * remain in their respective adapter files.
 */
import { DEFAULT_LANGUAGE } from './languages'

/**
 * Voice prompts for all supported languages.
 * Each prompt has a key-per-language with fallback to English.
 *
 * Future extension: admins can upload recorded audio per prompt+language.
 * The adapter would check for a custom audio URL first, falling back to
 * these TTS strings. TwiML would use <Play> for audio, <Say> for TTS.
 */
export const VOICE_PROMPTS: Record<string, Record<string, string>> = {
  greeting: {
    en: 'Thank you for calling {name}.',
    es: 'Gracias por llamar a {name}.',
    zh: '感谢您致电{name}。',
    tl: 'Salamat sa pagtawag sa {name}.',
    vi: 'Cảm ơn bạn đã gọi đến {name}.',
    ar: 'شكراً لاتصالك بـ {name}.',
    fr: 'Merci d\'avoir appelé {name}.',
    ht: 'Mèsi paske ou rele {name}.',
    ko: '{name}에 전화해 주셔서 감사합니다.',
    ru: 'Спасибо, что позвонили в {name}.',
    hi: '{name} पर कॉल करने के लिए धन्यवाद।',
    pt: 'Obrigado por ligar para {name}.',
    de: 'Vielen Dank für Ihren Anruf bei {name}.',
  },
  rateLimited: {
    en: 'We are currently experiencing high call volume. Please try again later.',
    es: 'Estamos experimentando un alto volumen de llamadas. Por favor, intente más tarde.',
    zh: '我们目前通话量较大，请稍后再试。',
    tl: 'Maraming tumatawag sa ngayon. Pakisubukan muli mamaya.',
    vi: 'Chúng tôi hiện đang có lượng cuộc gọi cao. Vui lòng thử lại sau.',
    ar: 'نحن نواجه حاليا حجم مكالمات كبير. يرجى المحاولة مرة أخرى لاحقا.',
    fr: 'Nous connaissons actuellement un volume d\'appels élevé. Veuillez réessayer plus tard.',
    ht: 'Nou gen anpil apèl kounye a. Tanpri eseye ankò pita.',
    ko: '현재 통화량이 많습니다. 나중에 다시 시도해 주세요.',
    ru: 'В настоящее время у нас большой объем звонков. Пожалуйста, перезвоните позже.',
    hi: 'वर्तमान में कॉल की संख्या अधिक है। कृपया बाद में पुनः प्रयास करें।',
    pt: 'Estamos com um alto volume de chamadas. Por favor, tente novamente mais tarde.',
    de: 'Wir haben derzeit ein hohes Anrufaufkommen. Bitte versuchen Sie es später erneut.',
  },
  captchaPrompt: {
    en: 'Please enter the following digits:',
    es: 'Por favor, ingrese los siguientes dígitos:',
    zh: '请输入以下数字：',
    tl: 'Pakilagay ang mga sumusunod na numero:',
    vi: 'Vui lòng nhập các chữ số sau:',
    ar: 'يرجى إدخال الأرقام التالية:',
    fr: 'Veuillez saisir les chiffres suivants :',
    ht: 'Tanpri antre chif sa yo:',
    ko: '다음 숫자를 입력해 주세요:',
    ru: 'Пожалуйста, введите следующие цифры:',
    hi: 'कृपया निम्नलिखित अंक दर्ज करें:',
    pt: 'Por favor, digite os seguintes números:',
    de: 'Bitte geben Sie die folgenden Ziffern ein:',
  },
  captchaTimeout: {
    en: 'We did not receive your input. Goodbye.',
    es: 'No recibimos su entrada. Adiós.',
    zh: '我们未收到您的输入。再见。',
    tl: 'Hindi namin natanggap ang iyong input. Paalam.',
    vi: 'Chúng tôi không nhận được thông tin của bạn. Tạm biệt.',
    ar: 'لم نتلق مدخلاتك. مع السلامة.',
    fr: 'Nous n\'avons pas reçu votre saisie. Au revoir.',
    ht: 'Nou pa resevwa repons ou. Orevwa.',
    ko: '입력을 받지 못했습니다. 안녕히 계세요.',
    ru: 'Мы не получили ваш ввод. До свидания.',
    hi: 'हमें आपका इनपुट नहीं मिला। अलविदा।',
    pt: 'Não recebemos sua entrada. Até logo.',
    de: 'Wir haben Ihre Eingabe nicht erhalten. Auf Wiederhören.',
  },
  pleaseHold: {
    en: 'Please hold while we connect you.',
    es: 'Por favor, espere mientras lo conectamos.',
    zh: '请稍候，我们正在为您转接。',
    tl: 'Pakihintay habang kinokonekta ka namin.',
    vi: 'Xin vui lòng chờ trong khi chúng tôi kết nối bạn.',
    ar: 'يرجى الانتظار بينما نقوم بتوصيلك.',
    fr: 'Veuillez patienter pendant que nous vous connectons.',
    ht: 'Tanpri tann pandan n ap konekte ou.',
    ko: '연결해 드릴 때까지 잠시만 기다려 주세요.',
    ru: 'Пожалуйста, подождите, пока мы вас соединяем.',
    hi: 'कृपया प्रतीक्षा करें, हम आपको कनेक्ट कर रहे हैं।',
    pt: 'Por favor, aguarde enquanto conectamos você.',
    de: 'Bitte warten Sie, während wir Sie verbinden.',
  },
  captchaSuccess: {
    en: 'Thank you. Please hold while we connect you.',
    es: 'Gracias. Por favor, espere mientras lo conectamos.',
    zh: '谢谢。请稍候，我们正在为您转接。',
    tl: 'Salamat. Pakihintay habang kinokonekta ka namin.',
    vi: 'Cảm ơn bạn. Xin vui lòng chờ trong khi chúng tôi kết nối bạn.',
    ar: 'شكرا لك. يرجى الانتظار بينما نقوم بتوصيلك.',
    fr: 'Merci. Veuillez patienter pendant que nous vous connectons.',
    ht: 'Mèsi. Tanpri tann pandan n ap konekte ou.',
    ko: '감사합니다. 연결해 드릴 때까지 잠시만 기다려 주세요.',
    ru: 'Спасибо. Пожалуйста, подождите, пока мы вас соединяем.',
    hi: 'धन्यवाद। कृपया प्रतीक्षा करें, हम आपको कनेक्ट कर रहे हैं।',
    pt: 'Obrigado. Por favor, aguarde enquanto conectamos você.',
    de: 'Danke. Bitte warten Sie, während wir Sie verbinden.',
  },
  captchaFail: {
    en: 'Invalid input. Goodbye.',
    es: 'Entrada inválida. Adiós.',
    zh: '输入无效。再见。',
    tl: 'Hindi valid ang input. Paalam.',
    vi: 'Thông tin không hợp lệ. Tạm biệt.',
    ar: 'إدخال غير صالح. مع السلامة.',
    fr: 'Saisie invalide. Au revoir.',
    ht: 'Repons envalid. Orevwa.',
    ko: '잘못된 입력입니다. 안녕히 계세요.',
    ru: 'Неверный ввод. До свидания.',
    hi: 'अमान्य इनपुट। अलविदा।',
    pt: 'Entrada inválida. Até logo.',
    de: 'Ungültige Eingabe. Auf Wiederhören.',
  },
  waitMessage: {
    en: 'Your call is important to us. Please hold while we connect you with a volunteer.',
    es: 'Su llamada es importante para nosotros. Por favor, espere mientras lo conectamos con un voluntario.',
    zh: '您的来电对我们非常重要。请稍候，我们正在为您转接志愿者。',
    tl: 'Mahalaga sa amin ang iyong tawag. Pakihintay habang kinokonekta ka namin sa isang boluntaryo.',
    vi: 'Cuộc gọi của bạn rất quan trọng với chúng tôi. Xin vui lòng chờ trong khi chúng tôi kết nối bạn với tình nguyện viên.',
    ar: 'مكالمتك مهمة بالنسبة لنا. يرجى الانتظار بينما نقوم بتوصيلك بمتطوع.',
    fr: 'Votre appel est important pour nous. Veuillez patienter pendant que nous vous connectons avec un bénévole.',
    ht: 'Apèl ou enpòtan pou nou. Tanpri tann pandan n ap konekte ou ak yon volontè.',
    ko: '귀하의 전화는 소중합니다. 자원봉사자와 연결해 드릴 때까지 잠시만 기다려 주세요.',
    ru: 'Ваш звонок важен для нас. Пожалуйста, подождите, пока мы соединяем вас с волонтёром.',
    hi: 'आपकी कॉल हमारे लिए महत्वपूर्ण है। कृपया प्रतीक्षा करें, हम आपको एक स्वयंसेवक से जोड़ रहे हैं।',
    pt: 'Sua chamada é importante para nós. Por favor, aguarde enquanto conectamos você com um voluntário.',
    de: 'Ihr Anruf ist uns wichtig. Bitte warten Sie, während wir Sie mit einem Freiwilligen verbinden.',
  },
  voicemailPrompt: {
    en: 'No one is available to take your call right now. Please leave a message after the tone and we will get back to you.',
    es: 'No hay nadie disponible para atender su llamada en este momento. Por favor, deje un mensaje después del tono y nos pondremos en contacto con usted.',
    zh: '目前没有人能接听您的电话。请在提示音后留言，我们会尽快回复您。',
    tl: 'Walang available na makasagot ng iyong tawag ngayon. Mangyaring mag-iwan ng mensahe pagkatapos ng tono.',
    vi: 'Hiện không có ai có thể nhận cuộc gọi của bạn. Vui lòng để lại tin nhắn sau tiếng bíp.',
    ar: 'لا يوجد أحد متاح للرد على مكالمتك الآن. يرجى ترك رسالة بعد النغمة.',
    fr: 'Personne n\'est disponible pour prendre votre appel pour le moment. Veuillez laisser un message après le bip.',
    ht: 'Pa gen moun disponib pou pran apèl ou kounye a. Tanpri kite yon mesaj apre son an.',
    ko: '현재 전화를 받을 수 있는 사람이 없습니다. 신호음 후 메시지를 남겨주세요.',
    ru: 'В данный момент никто не может ответить на ваш звонок. Пожалуйста, оставьте сообщение после сигнала.',
    hi: 'इस समय आपकी कॉल लेने के लिए कोई उपलब्ध नहीं है। कृपया बीप के बाद एक संदेश छोड़ें।',
    pt: 'Ninguém está disponível para atender sua ligação no momento. Por favor, deixe uma mensagem após o sinal.',
    de: 'Im Moment ist niemand verfügbar, um Ihren Anruf entgegenzunehmen. Bitte hinterlassen Sie eine Nachricht nach dem Signalton.',
  },
}

/**
 * IVR language menu prompts -- each language announces itself in its native voice.
 * Keyed by language code, value is the phrase spoken in that language.
 */
export const IVR_PROMPTS: Record<string, string> = {
  es: 'Para español, marque uno.',
  en: 'For English, press two.',
  zh: '如需中文服务，请按三。',
  tl: 'Para sa Tagalog, pindutin ang apat.',
  vi: 'Tiếng Việt, nhấn năm.',
  ar: 'للعربية، اضغط ستة.',
  fr: 'Pour le français, appuyez sur sept.',
  ht: 'Pou Kreyòl, peze wit.',
  ko: '한국어는 아홉 번을 눌러주세요.',
  ru: 'Для русского языка нажмите ноль.',
}

/** Voicemail "thank you" messages, keyed by language code. */
export const VOICEMAIL_THANKS: Record<string, string> = {
  en: 'Thank you for your message. Goodbye.',
  es: 'Gracias por su mensaje. Adiós.',
  zh: '感谢您的留言。再见。',
  tl: 'Salamat sa iyong mensahe. Paalam.',
  vi: 'Cảm ơn tin nhắn của bạn. Tạm biệt.',
  ar: 'شكراً لرسالتك. مع السلامة.',
  fr: 'Merci pour votre message. Au revoir.',
  ht: 'Mèsi pou mesaj ou. Orevwa.',
  ko: '메시지를 남겨 주셔서 감사합니다. 안녕히 계세요.',
  ru: 'Спасибо за ваше сообщение. До свидания.',
  hi: 'आपके संदेश के लिए धन्यवाद। अलविदा।',
  pt: 'Obrigado pela sua mensagem. Até logo.',
  de: 'Vielen Dank für Ihre Nachricht. Auf Wiederhören.',
}

/** Get a voice prompt in the given language, falling back to English. */
export function getPrompt(key: string, lang: string): string {
  return VOICE_PROMPTS[key]?.[lang] ?? VOICE_PROMPTS[key]?.[DEFAULT_LANGUAGE] ?? ''
}

/** Get the voicemail thank-you message in the given language, falling back to English. */
export function getVoicemailThanks(lang: string): string {
  return VOICEMAIL_THANKS[lang] ?? VOICEMAIL_THANKS[DEFAULT_LANGUAGE]
}
