# План тесту реклами: Бразилія, Мексика/Колумбія/Аргентина, Індія

Мета тижня: дізнатися, де найдешевше отримати людину, яка **провела перший дзвінок** і **відкрила оплату**.
Бюджет: €10–15 на день на регіон × 7 днів ≈ €210–315 разом.

## Важливо для всіх кампаній
- **Лише компʼютери.** Застосунок для Windows, з телефона його не встановити. Google Ads: пристрої → мобільні та планшети −100%. Meta: розміщення лише «Desktop» (Feeds на компʼютері) або окремий набір оголошень на десктоп.
- **Мова сторінки = мова оголошення.** Посилання нижче вже з правильною мовою.
- **Мітки UTM** у кожному посиланні, щоб бачити джерело.
- Перші 3 дні нічого не змінювати: алгоритмам потрібен час.

## Посилання
| Регіон | Google | Meta |
|---|---|---|
| Бразилія | `https://minutama.com/pt/freelancers?utm_source=google&utm_medium=cpc&utm_campaign=br_test` | `https://minutama.com/pt/freelancers?utm_source=meta&utm_medium=paid&utm_campaign=br_test` |
| Мексика, Колумбія, Аргентина | `https://minutama.com/es/freelancers?utm_source=google&utm_medium=cpc&utm_campaign=latam_es_test` | `https://minutama.com/es/freelancers?utm_source=meta&utm_medium=paid&utm_campaign=latam_es_test` |
| Індія | `https://minutama.com/freelancers?lang=hi&utm_source=google&utm_medium=cpc&utm_campaign=in_test` | `https://minutama.com/freelancers?lang=hi&utm_source=meta&utm_medium=paid&utm_campaign=in_test` |

---

## 1. Бразилія (португальська, Pro $7)

**Google Search, ключові слова (фразова відповідність):**
"transcrição de reuniões", "anotações de reunião ia", "transcrever chamadas", "inglês para freelancer", "reunião em inglês com cliente", "tradutor de chamadas em inglês", "alternativa ao otter", "upwork cliente gringo"

**Заголовки (до 30 символів):**
Entenda Clientes em Inglês · Perguntas Traduzidas ao Vivo · Briefing e Orçamento Prontos · Grátis para Windows · Nenhum Bot Entra na Chamada · Feito para Freelancers

**Описи (до 90 символів):**
- Cada pergunta do cliente na sua tela, traduzida para o português. Grátis para Windows.
- Depois da chamada: briefing, orçamento e e-mail de follow-up prontos em um minuto.

**Meta:**
- Основний текст: Cliente gringo fala rápido e você entende só metade? O Minutama mostra cada pergunta dele na sua tela, traduzida para o português. Depois da chamada, você recebe briefing, orçamento e e-mail prontos. Grátis para Windows.
- Заголовок: Nunca mais perca o que o cliente perguntou
- Опис: 10 chamadas grátis por mês
- Аудиторія: Бразилія, 20–45 років, інтереси Upwork, Fiverr, Workana, 99Freelas, Freelancer, Desenvolvimento web, Design gráfico.

## 2. Мексика, Колумбія, Аргентина (іспанська, Pro $7)

**Google Search:**
"transcribir llamadas", "notas de reuniones con ia", "transcripción de reuniones", "inglés para freelancers", "llamada con cliente en inglés", "traductor de llamadas en inglés", "alternativa a otter", "upwork clientes en inglés"

**Заголовки:**
Entiende a Tu Cliente · Preguntas Traducidas en Vivo · Brief y Presupuesto Listos · Gratis para Windows · Ningún Bot en la Llamada · Hecho para Freelancers

**Описи:**
- Cada pregunta de tu cliente en tu pantalla, traducida al español. Gratis para Windows.
- Al terminar: brief, presupuesto y email de seguimiento listos en un minuto.

**Meta:**
- Основний текст: ¿Tu cliente habla inglés rápido y entiendes solo la mitad? Minutama muestra cada pregunta en tu pantalla, traducida al español. Al terminar la llamada recibes el brief, el presupuesto y el email listos. Gratis para Windows.
- Заголовок: No vuelvas a perder lo que preguntó tu cliente
- Опис: 10 llamadas gratis al mes
- Аудиторія: MX, CO, AR, 20–45 років, інтереси Upwork, Fiverr, Workana, Freelancer, Trabajo remoto, Desarrollo web.

## 3. Індія (англійська сторінка, картки гінді, Pro $5)

**Google Search:**
"meeting notes ai", "call transcription app for windows", "otter ai alternative", "fireflies alternative free", "upwork client call", "ai notes for client calls", "meeting transcription free"

**Заголовки:**
Never Miss a Client Question · Live Question Cards · Brief + Estimate After Calls · Free for Windows · No Bot Joins the Call · Built for Freelancers

**Описи:**
- Every client question on your screen, with Hindi translation and term explanations.
- After the call: brief, estimate draft and follow-up email in a minute. Free for Windows.

**Meta:**
- Основний текст: US client talking fast on a call? Minutama shows every question on your screen, explains hard terms, and after the call writes the brief, the estimate and the follow-up email. Free for Windows.
- Заголовок: Never miss what your client asked
- Опис: 10 calls a month free
- Аудиторія: Індія, 21–40 років, інтереси Upwork, Fiverr, Freelancer.com, Toptal, Remote work, Web development.

---

## Що робите ви (налаштування акаунтів)
1. **Google Ads** (ads.google.com): створити акаунт, додати картку, створити 3 кампанії «Пошук», мета «Трафік на сайт». Налаштування вище, мова кампанії: португальська / іспанська / англійська.
2. **Meta Ads Manager** (business.facebook.com): створити рекламний акаунт, кампанія «Трафік», 3 групи оголошень за регіонами, розміщення лише на компʼютері.
3. Креативи для Meta: квадрат 1080×1080 з карткою питання. Можу згенерувати картинки й короткі відео з анімацією картки.

## Як читати результати через 7 днів
1. Cloudflare → Web Analytics: відвідування по країнах і сторінках.
2. Supabase → SQL editor → `supabase/queries/funnel.sql`, блок «Funnel by country»: реєстрації, перший дзвінок, відкрили оплату по країнах.
3. Stripe: оплати.
4. Рахуємо **ціну за людину, що провела перший дзвінок** = витрати на регіон / started_a_call. Регіон із найнижчою ціною й хоча б однією оплатою отримує весь бюджет на наступний тиждень.
