---
title: "Налаштування: SignalWire"
description: Покроковий посібник із налаштування SignalWire як телефонного провайдера.
---

SignalWire — це економічно вигідна альтернатива Twilio з сумісним API. Він використовує LaML (мову розмітки, сумісну з TwiML), тому міграція між Twilio і SignalWire є простою.

## Передумови

- [Обліковий запис SignalWire](https://signalwire.com/signup) (доступна безкоштовна пробна версія)
- Ваш екземпляр Llamenos розгорнуто та доступний за публічною URL-адресою

## 1. Створіть обліковий запис SignalWire

Зареєструйтесь на [signalwire.com/signup](https://signalwire.com/signup). Під час реєстрації ви оберете **ім'я простору** (Space name), наприклад, `myhotline`. Ваша URL-адреса простору буде `myhotline.signalwire.com`. Запишіть це ім'я — воно знадобиться вам для налаштування.

## 2. Придбайте телефонний номер

1. У панелі керування SignalWire перейдіть до **Phone Numbers**
2. Натисніть **Buy a Phone Number**
3. Знайдіть номер із можливістю голосового зв'язку
4. Придбайте номер

## 3. Отримайте свої облікові дані

1. Перейдіть до **API** у панелі керування SignalWire
2. Знайдіть свій **Project ID** (він виконує функцію Account SID)
3. Створіть новий **API Token**, якщо у вас його ще немає — він виконує функцію Auth Token

## 4. Налаштуйте вебхуки

1. У панелі керування перейдіть до **Phone Numbers**
2. Натисніть на ваш номер гарячої лінії
3. У розділі **Voice Settings** встановіть:
   - **Handle calls using**: LaML Webhooks
   - **When a call comes in**: `https://your-domain.com/api/telephony/incoming` (POST)
   - **Call status callback**: `https://your-domain.com/api/telephony/status` (POST)

## 5. Налаштуйте в Llamenos

1. Увійдіть як адміністратор
2. Перейдіть до **Settings** > **Telephony Provider**
3. Оберіть **SignalWire** у спадному меню провайдера
4. Введіть:
   - **Account SID**: ваш Project ID з кроку 3
   - **Auth Token**: ваш API Token з кроку 3
   - **SignalWire Space**: ім'я вашого простору (лише ім'я, не повна URL-адреса — наприклад, `myhotline`)
   - **Phone Number**: номер, який ви придбали (формат E.164)
5. Натисніть **Save**

## 6. Перевірте налаштування

Подзвоніть на номер гарячої лінії. Ви повинні почути меню вибору мови, а потім потрапити до сценарію виклику.

## Налаштування WebRTC (необов'язково)

WebRTC від SignalWire використовує той самий шаблон API-ключа, що й Twilio:

1. У панелі керування SignalWire створіть **API Key** у розділі **API** > **Tokens**
2. Створіть **LaML Application**:
   - Перейдіть до **LaML** > **LaML Applications**
   - Встановіть Voice URL на `https://your-domain.com/api/telephony/webrtc-incoming`
   - Запишіть Application SID
3. У Llamenos перейдіть до **Settings** > **Telephony Provider**
4. Увімкніть перемикач **WebRTC Calling**
5. Введіть API Key SID, API Key Secret та Application SID
6. Натисніть **Save**

## Відмінності від Twilio

- **LaML проти TwiML**: SignalWire використовує LaML, який функціонально ідентичний до TwiML. Llamenos обробляє це автоматично.
- **Space URL**: API-запити надсилаються на `{space}.signalwire.com` замість `api.twilio.com`. Адаптер обробляє це через ім'я простору, яке ви вказали.
- **Ціни**: SignalWire зазвичай на 30–40% дешевший за Twilio для голосових викликів.
- **Паритет функцій**: Усі функції Llamenos (запис, транскрипція, CAPTCHA, голосова пошта) працюють ідентично з SignalWire.

## Вирішення проблем

- **Помилки "Space not found"**: Перевірте ім'я простору (лише субдомен, не повна URL-адреса).
- **Невдачі вебхуків**: Переконайтеся, що URL-адреса вашого сервера публічно доступна та використовує HTTPS.
- **Проблеми з API-токеном**: Токени SignalWire можуть закінчуватися. Створіть новий токен, якщо отримуєте помилки автентифікації.
